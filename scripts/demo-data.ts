import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, like, not } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { getDb, type DbOrTx } from "../src/db";
import {
  account,
  bookings,
  classSessions,
  instructors,
  sessionTemplates,
  sports,
  user,
  waitlistEntries,
} from "../src/db/schema";
import { fromSofiaDateTime, toSofiaDateInput } from "../src/lib/format";

// Fictitious demo data, easy to remove again. Everything demo is recognisable:
//  - users: email @demo.wheelylove.invalid (".invalid" can never be a real address)
//  - instructors: slug "demo-..."; their templates and sessions belong to them.
// Pure library (no process.exit) so the tests can drive it; the CLIs are
// scripts/seed-demo.ts and scripts/remove-demo.ts.

export const DEMO_DOMAIN = "demo.wheelylove.invalid";
export const DEMO_SLUG_PREFIX = "demo-";

const SPORT_PLAN = {
  spinning: { durationMin: 45, capacity: 12, priceCents: 1200, instructor: "demo-eli" },
  "steel-training": { durationMin: 50, capacity: 10, priceCents: 1500, instructor: "demo-tabi" },
  pilates: { durationMin: 55, capacity: 8, priceCents: 1400, instructor: "demo-ani" },
} as const;
type SportSlug = keyof typeof SPORT_PLAN;

const DEMO_INSTRUCTORS = [
  { slug: "demo-ani", name: "Ани", local: "ani", specialties: "Пилатес" },
  { slug: "demo-tabi", name: "Таби", local: "tabi", specialties: "Steel Training" },
  { slug: "demo-eli", name: "Ели", local: "eli", specialties: "Спининг" },
] as const;

// ISO weekday (1 = Monday), sport, Sofia wall-clock start.
const WEEK: readonly [number, SportSlug, string][] = [
  [1, "spinning", "18:15"],
  [2, "spinning", "17:30"],
  [2, "spinning", "18:30"],
  [3, "steel-training", "18:30"],
  [4, "spinning", "17:30"],
  [4, "spinning", "18:30"],
  [5, "spinning", "18:15"],
  [6, "spinning", "08:00"],
  [6, "pilates", "09:30"],
  [7, "steel-training", "08:30"],
];

const CLIENT_NAMES = [
  "Мария Петрова", "Иван Георгиев", "Елена Димитрова", "Георги Иванов", "Десислава Стоянова",
  "Николай Тодоров", "Виктория Христова", "Петър Николов", "Радостина Колева", "Стефан Атанасов",
  "Йорданка Маринова", "Александър Попов", "Габриела Василева", "Борис Костов", "Ивелина Минчева",
  "Калоян Здравков", "Теодора Борисова", "Мартин Ангелов", "Симона Йорданова", "Димитър Спасов",
  "Цветелина Рангелова", "Владимир Генчев", "Моника Тодорова", "Красимир Данчев", "Надежда Пенева",
];

function demoEmails(): string[] {
  return [
    ...DEMO_INSTRUCTORS.map((d) => `${d.local}@${DEMO_DOMAIN}`),
    ...CLIENT_NAMES.map((_, i) => `client${String(i + 1).padStart(2, "0")}@${DEMO_DOMAIN}`),
  ];
}

export const DEMO_CLIENT_COUNT = CLIENT_NAMES.length;
export const DEMO_WEEKS_BACK = 4;
export const DEMO_WEEKS_FORWARD = 4;
export const MIN_PASSWORD_LENGTH = 10; // = emailAndPassword.minPasswordLength in src/lib/auth.ts

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

class DryRunRollback extends Error {
  constructor(public readonly report: unknown) {
    super("dry-run rollback");
  }
}

// Runs fn in a transaction; without apply the transaction is rolled back, so
// the dry-run report is computed by exactly the same code as the real run.
async function inTransaction<T>(apply: boolean, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  try {
    return await getDb().transaction(async (tx) => {
      const result = await fn(tx);
      if (!apply) throw new DryRunRollback(result);
      return result;
    });
  } catch (e) {
    if (e instanceof DryRunRollback) return e.report as T;
    throw e;
  }
}

export type SeedReport = {
  applied: boolean;
  instructorsCreated: number;
  instructorAccountsCreated: number;
  clientsCreated: number;
  templatesCreated: number;
  sessionsCreated: number;
  bookingsCreated: number;
  waitlistCreated: number;
  sportDefaultsFilled: number;
  generatedPassword: string | null;
};

export async function seedDemo(opts: {
  apply: boolean;
  password?: string;
  now?: Date;
}): Promise<SeedReport> {
  const now = opts.now ?? new Date();
  if (opts.password !== undefined && opts.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`--password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const generated = opts.password === undefined ? randomBytes(12).toString("base64url") : null;
  const password = opts.password ?? generated!;

  return inTransaction(opts.apply, async (tx) => {
    const report: SeedReport = {
      applied: opts.apply,
      instructorsCreated: 0,
      instructorAccountsCreated: 0,
      clientsCreated: 0,
      templatesCreated: 0,
      sessionsCreated: 0,
      bookingsCreated: 0,
      waitlistCreated: 0,
      sportDefaultsFilled: 0,
      generatedPassword: null,
    };

    // 1. The three sports must already exist.
    const slugs = Object.keys(SPORT_PLAN) as SportSlug[];
    const sportRows = await tx.select().from(sports).where(inArray(sports.slug, slugs));
    const missing = slugs.filter((s) => !sportRows.some((r) => r.slug === s));
    if (missing.length) {
      throw new Error(`Missing sports (create them first): ${missing.join(", ")}`);
    }
    const sportId = new Map(sportRows.map((r) => [r.slug as SportSlug, r.id]));
    for (const r of sportRows) {
      const plan = SPORT_PLAN[r.slug as SportSlug];
      if (r.defaultDurationMin === null) {
        await tx.update(sports).set({ defaultDurationMin: plan.durationMin }).where(eq(sports.id, r.id));
        report.sportDefaultsFilled++;
      }
      if (r.defaultPriceCents === null) {
        await tx.update(sports).set({ defaultPriceCents: plan.priceCents }).where(eq(sports.id, r.id));
        report.sportDefaultsFilled++;
      }
    }

    // 2. Instructors + their login accounts (role instructor, verified email).
    const passwordHash = opts.apply ? await hashPassword(password) : "dry-run";
    const instructorId = new Map<string, number>();
    for (const d of DEMO_INSTRUCTORS) {
      const email = `${d.local}@${DEMO_DOMAIN}`;
      let [ins] = await tx
        .select({ id: instructors.id, userId: instructors.userId })
        .from(instructors)
        .where(eq(instructors.slug, d.slug));
      if (!ins) {
        [ins] = await tx
          .insert(instructors)
          .values({
            slug: d.slug,
            name: d.name,
            bio: "Демо инструктор (фиктивни данни).",
            email,
            specialties: d.specialties,
          })
          .returning({ id: instructors.id, userId: instructors.userId });
        report.instructorsCreated++;
      }
      instructorId.set(d.slug, ins.id);

      let [u] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
      if (!u) {
        const id = randomUUID();
        await tx.insert(user).values({ id, name: d.name, email, emailVerified: true, role: "instructor" });
        await tx.insert(account).values({
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          userId: id,
          password: passwordHash,
        });
        u = { id };
        report.instructorAccountsCreated++;
      }
      if (ins.userId !== u.id) {
        await tx.update(instructors).set({ userId: u.id }).where(eq(instructors.id, ins.id));
      }
    }
    if (opts.apply && report.instructorAccountsCreated > 0) report.generatedPassword = generated;

    // 3. Weekly template.
    const templates: { id: number; weekday: number; startTime: string; sport: SportSlug }[] = [];
    for (const [weekday, sport, startTime] of WEEK) {
      const plan = SPORT_PLAN[sport];
      const insId = instructorId.get(plan.instructor)!;
      const [found] = await tx
        .select({ id: sessionTemplates.id })
        .from(sessionTemplates)
        .where(
          and(
            eq(sessionTemplates.instructorId, insId),
            eq(sessionTemplates.sportId, sportId.get(sport)!),
            eq(sessionTemplates.weekday, weekday),
            eq(sessionTemplates.startTime, startTime)
          )
        );
      let id = found?.id;
      if (id === undefined) {
        [{ id }] = await tx
          .insert(sessionTemplates)
          .values({
            sportId: sportId.get(sport)!,
            instructorId: insId,
            weekday,
            startTime,
            durationMin: plan.durationMin,
            capacity: plan.capacity,
            priceCents: plan.priceCents,
            // Inactive: "Генерирай" must not extend the demo into the live schedule.
            active: false,
          })
          .returning({ id: sessionTemplates.id });
        report.templatesCreated++;
      }
      templates.push({ id, weekday, startTime, sport });
    }

    // 4. Clients (no account row = nobody can sign in as them).
    const clients = CLIENT_NAMES.map((name, i) => {
      const nn = String(i + 1).padStart(2, "0");
      return { name, email: `client${nn}@${DEMO_DOMAIN}`, phone: `+359 88 000 00${nn}` };
    });
    const existing = await tx
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(inArray(user.email, clients.map((c) => c.email)));
    const clientId = new Map(existing.map((u) => [u.email, u.id]));
    for (const c of clients) {
      if (clientId.has(c.email)) continue;
      const id = randomUUID();
      await tx.insert(user).values({ id, name: c.name, email: c.email, emailVerified: true, role: "user" });
      clientId.set(c.email, id);
      report.clientsCreated++;
    }

    // 5. Sessions: 4 weeks back .. 4 weeks forward, through the same
    //    (template_id, template_slot) key the real generator uses.
    const today = toSofiaDateInput(now);
    const rows: (typeof classSessions.$inferInsert)[] = [];
    for (let i = -DEMO_WEEKS_BACK * 7; i < DEMO_WEEKS_FORWARD * 7; i++) {
      const date = addDays(today, i);
      for (const t of templates) {
        if (isoWeekday(date) !== t.weekday) continue;
        const plan = SPORT_PLAN[t.sport];
        const startTime = fromSofiaDateTime(date, t.startTime);
        rows.push({
          templateId: t.id,
          templateSlot: startTime,
          sportId: sportId.get(t.sport)!,
          instructorId: instructorId.get(plan.instructor)!,
          startTime,
          endTime: new Date(startTime.getTime() + plan.durationMin * 60_000),
          capacity: plan.capacity,
          priceCents: plan.priceCents,
        });
      }
    }
    const created = rows.length
      ? await tx
          .insert(classSessions)
          .values(rows)
          .onConflictDoNothing({ target: [classSessions.templateId, classSessions.templateSlot] })
          .returning({
            id: classSessions.id,
            startTime: classSessions.startTime,
            capacity: classSessions.capacity,
          })
      : [];
    created.sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id - b.id);
    report.sessionsCreated = created.length;

    // 6. Bookings / waitlist only for the sessions created by THIS run, so a
    //    second run changes nothing. booked_count is set from the real count.
    const rand = mulberry32(20261005);
    const bookingRows: (typeof bookings.$inferInsert)[] = [];
    const waitRows: (typeof waitlistEntries.$inferInsert)[] = [];
    let futureIdx = 0;
    for (const s of created) {
      const future = s.startTime.getTime() > now.getTime();
      const full = future ? futureIdx++ % 6 === 2 : rand() < 0.12;
      const fill = full ? s.capacity : Math.ceil(s.capacity * (0.4 + 0.6 * rand()));
      const order = [...clients];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      order.slice(0, fill).forEach((c, k) => {
        const attended = !future && rand() < 0.85;
        bookingRows.push({
          sessionId: s.id,
          userId: clientId.get(c.email)!,
          userEmail: c.email,
          userPhone: c.phone,
          status: future ? (k % 3 === 0 ? "confirmed" : "pending") : attended ? "confirmed" : "pending",
          paymentMethod: "cash",
          attendance: future ? "unknown" : attended ? "attended" : "no_show",
        });
      });
      if (full && future) {
        const waiting = 1 + Math.floor(rand() * 3);
        order.slice(fill, fill + waiting).forEach((c) =>
          waitRows.push({ sessionId: s.id, userId: clientId.get(c.email)!, userEmail: c.email })
        );
      }
      await tx.update(classSessions).set({ bookedCount: fill }).where(eq(classSessions.id, s.id));
    }
    for (let i = 0; i < bookingRows.length; i += 500) {
      await tx.insert(bookings).values(bookingRows.slice(i, i + 500));
    }
    if (waitRows.length) await tx.insert(waitlistEntries).values(waitRows);
    report.bookingsCreated = bookingRows.length;
    report.waitlistCreated = waitRows.length;
    return report;
  });
}

export type RemoveReport = {
  applied: boolean;
  waitlist: number;
  bookings: number;
  sessions: number;
  templates: number;
  users: number;
  instructors: number;
};

// Deletes only demo rows, children first. Refuses (throws, nothing is deleted)
// when a REAL booking or waitlist entry sits on a demo session: those people
// must be handled by the studio first.
export async function removeDemo(opts: { apply: boolean }): Promise<RemoveReport> {
  return inTransaction(opts.apply, async (tx) => {
    const report: RemoveReport = {
      applied: opts.apply,
      waitlist: 0,
      bookings: 0,
      sessions: 0,
      templates: 0,
      users: 0,
      instructors: 0,
    };
    // Exactly the listed demo instructors / users - never a prefix match.
    const demoInstructors = await tx
      .select({ id: instructors.id })
      .from(instructors)
      .where(inArray(instructors.slug, DEMO_INSTRUCTORS.map((d) => d.slug)));
    const insIds = demoInstructors.map((i) => i.id);
    const demoEmail = `%@${DEMO_DOMAIN}`;

    if (insIds.length) {
      const sessionIds = (
        await tx
          .select({ id: classSessions.id })
          .from(classSessions)
          .where(inArray(classSessions.instructorId, insIds))
      ).map((s) => s.id);

      if (sessionIds.length) {
        const realBookings = await tx
          .select({ id: bookings.id })
          .from(bookings)
          .where(and(inArray(bookings.sessionId, sessionIds), not(like(bookings.userEmail, demoEmail))));
        const realWaiting = await tx
          .select({ id: waitlistEntries.id })
          .from(waitlistEntries)
          .where(
            and(inArray(waitlistEntries.sessionId, sessionIds), not(like(waitlistEntries.userEmail, demoEmail)))
          );
        if (realBookings.length || realWaiting.length) {
          throw new Error(
            `Refusing: ${realBookings.length} real booking(s) and ${realWaiting.length} real waitlist entr(ies) ` +
              "are on demo sessions. Cancel them (or move those people) first; nothing was deleted."
          );
        }
        report.waitlist = (
          await tx
            .delete(waitlistEntries)
            .where(inArray(waitlistEntries.sessionId, sessionIds))
            .returning({ id: waitlistEntries.id })
        ).length;
        report.bookings = (
          await tx.delete(bookings).where(inArray(bookings.sessionId, sessionIds)).returning({ id: bookings.id })
        ).length;
        report.sessions = (
          await tx.delete(classSessions).where(inArray(classSessions.id, sessionIds)).returning({ id: classSessions.id })
        ).length;
      }
      report.templates = (
        await tx
          .delete(sessionTemplates)
          .where(inArray(sessionTemplates.instructorId, insIds))
          .returning({ id: sessionTemplates.id })
      ).length;
    }

    // Users cascade to their sessions/accounts; instructors.user_id is set null.
    report.users = (
      await tx.delete(user).where(inArray(user.email, demoEmails())).returning({ id: user.id })
    ).length;
    if (insIds.length) {
      report.instructors = (
        await tx.delete(instructors).where(inArray(instructors.id, insIds)).returning({ id: instructors.id })
      ).length;
    }
    return report;
  });
}
