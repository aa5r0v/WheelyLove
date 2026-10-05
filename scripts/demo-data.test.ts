import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { and, eq, inArray, like, sql } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  email: vi.fn(async () => {}),
  verification: vi.fn(async () => {}),
  reset: vi.fn(async () => {}),
  existing: vi.fn(async () => {}),
}));
vi.mock("@/lib/email", () => ({
  sendBookingConfirmationEmail: mocks.email,
  sendBookingCancelledEmail: mocks.email,
  sendBookingReminderEmail: mocks.email,
  sendWaitlistSpotOpenEmail: mocks.email,
  sendVerificationEmail: mocks.verification,
  sendPasswordResetEmail: mocks.reset,
  sendExistingAccountEmail: mocks.existing,
}));

import { getDb } from "../src/db";
import {
  bookings,
  classSessions,
  instructors,
  sessionTemplates,
  sports,
  user,
  waitlistEntries,
} from "../src/db/schema";
import { toSofiaTimeInput } from "../src/lib/format";
import { signInCookie } from "../src/lib/test-helpers";
import { getAuth } from "../src/lib/auth";
import { DEMO_DOMAIN, removeDemo, seedDemo } from "./demo-data";

const db = getDb();
const execFileAsync = promisify(execFile);
// Far from the real clock, so the demo sessions never overlap other test files.
const NOW = new Date("2031-05-20T09:00:00Z"); // Tuesday 12:00 Sofia
const PASSWORD = "demo-password-123456";
const tag = `dtest-${Date.now()}`;
const SLUGS = ["spinning", "steel-training", "pilates"];
const createdSports: number[] = [];
const keptSports = new Map<number, { d: number | null; p: number | null }>();
let realIns: number;
let realSessions: number[] = [];
let realUser: string;
let realAccountId: string;

const demoInstructorIds = async () =>
  (await db.select({ id: instructors.id }).from(instructors).where(like(instructors.slug, "demo-%"))).map(
    (r) => r.id
  );

async function counts() {
  const ids = await demoInstructorIds();
  const sessions = ids.length
    ? await db.select({ id: classSessions.id }).from(classSessions).where(inArray(classSessions.instructorId, ids))
    : [];
  const sIds = sessions.map((s) => s.id);
  const n = (rows: unknown[]) => rows.length;
  return {
    instructors: ids.length,
    templates: ids.length
      ? n(await db.select().from(sessionTemplates).where(inArray(sessionTemplates.instructorId, ids)))
      : 0,
    sessions: sIds.length,
    bookings: sIds.length ? n(await db.select().from(bookings).where(inArray(bookings.sessionId, sIds))) : 0,
    waitlist: sIds.length
      ? n(await db.select().from(waitlistEntries).where(inArray(waitlistEntries.sessionId, sIds)))
      : 0,
    users: n(await db.select().from(user).where(like(user.email, `%@${DEMO_DOMAIN}`))),
  };
}

async function snapshotReal() {
  return {
    sessions: await db
      .select()
      .from(classSessions)
      .where(inArray(classSessions.id, realSessions))
      .orderBy(classSessions.id),
    bookings: await db
      .select()
      .from(bookings)
      .where(inArray(bookings.sessionId, realSessions))
      .orderBy(bookings.id),
    waitlist: await db.select().from(waitlistEntries).where(inArray(waitlistEntries.sessionId, realSessions)),
    instructor: await db.select().from(instructors).where(eq(instructors.id, realIns)),
    account: await db.select().from(user).where(eq(user.id, realAccountId)),
  };
}

beforeAll(async () => {
  // The three sports must exist (the script requires them). Reuse real ones.
  const have = await db.select().from(sports).where(inArray(sports.slug, SLUGS));
  for (const s of have) keptSports.set(s.id, { d: s.defaultDurationMin, p: s.defaultPriceCents });
  for (const slug of SLUGS.filter((s) => !have.some((h) => h.slug === s))) {
    const [c] = await db.insert(sports).values({ slug, name: slug }).returning();
    createdSports.push(c.id);
  }
  // Real (non-demo) data that must survive seed + remove byte for byte.
  const [ri] = await db.insert(instructors).values({ slug: `${tag}-real`, name: "Real" }).returning();
  realIns = ri.id;
  const [sp] = await db.select().from(sports).where(eq(sports.slug, "spinning"));
  const [rs] = await db
    .insert(classSessions)
    .values({
      sportId: sp.id,
      instructorId: realIns,
      startTime: new Date("2031-05-21T15:00:00Z"),
      endTime: new Date("2031-05-21T16:00:00Z"),
      capacity: 7,
      bookedCount: 1,
      priceCents: 999,
    })
    .returning();
  realSessions = [rs.id];
  realUser = `${tag}-real-user`;
  realAccountId = `${tag}-real-account`;
  await db.insert(user).values({ id: realAccountId, name: "Real", email: `${tag}-real@example.com` });
  await db.insert(bookings).values({
    sessionId: rs.id,
    userId: realUser,
    userEmail: "real@example.com",
    userPhone: "+359881111111",
  });
  await db.insert(waitlistEntries).values({ sessionId: rs.id, userId: `${realUser}-w`, userEmail: "w@example.com" });
});

afterAll(async () => {
  await removeDemo({ apply: true });
  await db.delete(waitlistEntries).where(inArray(waitlistEntries.sessionId, realSessions));
  await db.delete(bookings).where(inArray(bookings.sessionId, realSessions));
  await db.delete(classSessions).where(inArray(classSessions.id, realSessions));
  await db.delete(instructors).where(eq(instructors.id, realIns));
  await db.delete(user).where(eq(user.id, realAccountId));
  for (const [id, v] of keptSports) {
    await db.update(sports).set({ defaultDurationMin: v.d, defaultPriceCents: v.p }).where(eq(sports.id, id));
  }
  if (createdSports.length) await db.delete(sports).where(inArray(sports.id, createdSports));
});

describe("seed-demo", () => {
  it("stops with an error when one of the three sports is missing", async () => {
    const [pilates] = await db.select().from(sports).where(eq(sports.slug, "pilates"));
    await db.update(sports).set({ slug: `${tag}-hold` }).where(eq(sports.id, pilates.id));
    try {
      await expect(seedDemo({ apply: true, password: PASSWORD, now: NOW })).rejects.toThrow(/Missing sports.*pilates/);
    } finally {
      await db.update(sports).set({ slug: "pilates" }).where(eq(sports.id, pilates.id));
    }
    expect((await counts()).sessions).toBe(0);
  });

  it("refuses a too short --password before touching the database", async () => {
    await expect(seedDemo({ apply: true, password: "short", now: NOW })).rejects.toThrow(/at least 10/);
  });

  it("dry-run reports the plan and writes nothing", async () => {
    const real = await snapshotReal();
    const r = await seedDemo({ apply: false, now: NOW });
    expect(r).toMatchObject({
      applied: false,
      instructorsCreated: 3,
      instructorAccountsCreated: 3,
      clientsCreated: 25,
      templatesCreated: 10,
      sessionsCreated: 80,
      generatedPassword: null,
    });
    expect(await counts()).toEqual({ instructors: 0, templates: 0, sessions: 0, bookings: 0, waitlist: 0, users: 0 });
    expect(await snapshotReal()).toEqual(real);
  });

  it("--apply writes the weekly template, instructors with working accounts, 25 clients", async () => {
    const real = await snapshotReal();
    const r = await seedDemo({ apply: true, password: PASSWORD, now: NOW });
    expect(r).toMatchObject({ instructorsCreated: 3, instructorAccountsCreated: 3, clientsCreated: 25, templatesCreated: 10, sessionsCreated: 80 });
    expect(r.generatedPassword).toBeNull(); // password was given, nothing to print

    const tpl = await db
      .select({
        weekday: sessionTemplates.weekday,
        start: sessionTemplates.startTime,
        sport: sports.slug,
        dur: sessionTemplates.durationMin,
        cap: sessionTemplates.capacity,
        price: sessionTemplates.priceCents,
        instr: instructors.slug,
      })
      .from(sessionTemplates)
      .innerJoin(sports, eq(sports.id, sessionTemplates.sportId))
      .innerJoin(instructors, eq(instructors.id, sessionTemplates.instructorId))
      .where(like(instructors.slug, "demo-%"));
    const key = (t: (typeof tpl)[number]) => `${t.weekday} ${t.start} ${t.sport} ${t.dur} ${t.cap} ${t.price} ${t.instr}`;
    expect(tpl.map(key).sort()).toEqual(
      [
        "1 18:15 spinning 45 12 1200 demo-eli",
        "2 17:30 spinning 45 12 1200 demo-eli",
        "2 18:30 spinning 45 12 1200 demo-eli",
        "3 18:30 steel-training 50 10 1500 demo-tabi",
        "4 17:30 spinning 45 12 1200 demo-eli",
        "4 18:30 spinning 45 12 1200 demo-eli",
        "5 18:15 spinning 45 12 1200 demo-eli",
        "6 08:00 spinning 45 12 1200 demo-eli",
        "6 09:30 pilates 55 8 1400 demo-ani",
        "7 08:30 steel-training 50 10 1500 demo-tabi",
      ].sort()
    );

    // Sessions: every one sits on its template's Sofia wall-clock time and slot key.
    const ses = await db
      .select({
        start: classSessions.startTime,
        slot: classSessions.templateSlot,
        tplStart: sessionTemplates.startTime,
        end: classSessions.endTime,
        dur: sessionTemplates.durationMin,
      })
      .from(classSessions)
      .innerJoin(sessionTemplates, eq(sessionTemplates.id, classSessions.templateId))
      .innerJoin(instructors, eq(instructors.id, classSessions.instructorId))
      .where(like(instructors.slug, "demo-%"));
    expect(ses).toHaveLength(80);
    for (const s of ses) {
      expect(toSofiaTimeInput(s.start)).toBe(s.tplStart);
      expect(s.slot?.getTime()).toBe(s.start.getTime());
      expect(s.end.getTime() - s.start.getTime()).toBe(s.dur * 60_000);
    }
    const first = Math.min(...ses.map((s) => s.start.getTime()));
    const last = Math.max(...ses.map((s) => s.start.getTime()));
    expect(first).toBeGreaterThan(NOW.getTime() - 29 * 86_400_000);
    expect(last).toBeLessThan(NOW.getTime() + 28 * 86_400_000);
    expect(ses.some((s) => s.start < NOW) && ses.some((s) => s.start > NOW)).toBe(true);

    // Accounts: the password really signs in (hash made with better-auth's own function);
    // role + verified email; instructors are linked. Clients have no credential.
    for (const local of ["ani", "tabi", "eli"]) {
      const email = `${local}@${DEMO_DOMAIN}`;
      const [u] = await db.select().from(user).where(eq(user.email, email));
      expect(u).toMatchObject({ role: "instructor", emailVerified: true });
      const [ins] = await db.select().from(instructors).where(eq(instructors.slug, `demo-${local}`));
      expect(ins.userId).toBe(u.id);
      expect(await signInCookie(email, PASSWORD)).toMatch(/session_token=/);
    }
    await expect(signInCookie(`client01@${DEMO_DOMAIN}`, PASSWORD)).rejects.toThrow();
    await expect(
      getAuth().api.signInEmail({ body: { email: `client01@${DEMO_DOMAIN}`, password: "anything-12345" }, headers: new Headers() })
    ).rejects.toThrow();

    // Clients: 25, Bulgarian phone format, no password.
    const clients = await db.select().from(user).where(like(user.email, `client%@${DEMO_DOMAIN}`));
    expect(clients).toHaveLength(25);
    const phones = await db.select({ p: bookings.userPhone }).from(bookings).where(like(bookings.userEmail, `client%@${DEMO_DOMAIN}`));
    for (const { p } of phones) expect(p).toMatch(/^\+359 88 000 00\d\d$/);

    // Real data is byte-for-byte unchanged.
    expect(await snapshotReal()).toEqual(real);
  });

  it("booked_count equals the number of active bookings for EVERY demo session (invariant), fill 40-100%", async () => {
    const rows = await db
      .select({
        id: classSessions.id,
        cap: classSessions.capacity,
        booked: classSessions.bookedCount,
        real: sql<number>`(select count(*) from bookings b where b.session_id = ${classSessions.id} and b.status in ('pending','confirmed'))::int`,
        all: sql<number>`(select count(*) from bookings b where b.session_id = ${classSessions.id})::int`,
      })
      .from(classSessions)
      .innerJoin(instructors, eq(instructors.id, classSessions.instructorId))
      .where(like(instructors.slug, "demo-%"));
    expect(rows).toHaveLength(80);
    for (const r of rows) {
      expect(r.booked, `session ${r.id}`).toBe(r.real);
      expect(r.all).toBe(r.real);
      expect(r.booked).toBeLessThanOrEqual(r.cap);
      expect(r.booked / r.cap).toBeGreaterThanOrEqual(0.4);
    }
    expect(rows.filter((r) => r.booked === r.cap).length).toBeGreaterThanOrEqual(3);
  });

  it("attendance: past sessions ~85% attended / rest no_show; future unknown; waitlist only on full future sessions (1-3)", async () => {
    const rows = await db
      .select({ a: bookings.attendance, start: classSessions.startTime })
      .from(bookings)
      .innerJoin(classSessions, eq(classSessions.id, bookings.sessionId))
      .where(like(bookings.userEmail, `%@${DEMO_DOMAIN}`));
    const past = rows.filter((r) => r.start <= NOW);
    const future = rows.filter((r) => r.start > NOW);
    expect(past.length).toBeGreaterThan(100);
    expect(past.every((r) => r.a === "attended" || r.a === "no_show")).toBe(true);
    const share = past.filter((r) => r.a === "attended").length / past.length;
    expect(share).toBeGreaterThan(0.75);
    expect(share).toBeLessThan(0.95);
    expect(future.every((r) => r.a === "unknown")).toBe(true);

    const w = await db
      .select({
        n: sql<number>`count(*)::int`,
        cap: classSessions.capacity,
        booked: classSessions.bookedCount,
        start: classSessions.startTime,
      })
      .from(waitlistEntries)
      .innerJoin(classSessions, eq(classSessions.id, waitlistEntries.sessionId))
      .innerJoin(instructors, eq(instructors.id, classSessions.instructorId))
      .where(like(instructors.slug, "demo-%"))
      .groupBy(waitlistEntries.sessionId, classSessions.capacity, classSessions.bookedCount, classSessions.startTime);
    expect(w.length).toBeGreaterThanOrEqual(3);
    for (const x of w) {
      expect(x.start > NOW).toBe(true);
      expect(x.booked).toBe(x.cap);
      expect(x.n).toBeGreaterThanOrEqual(1);
      expect(x.n).toBeLessThanOrEqual(3);
    }
  });

  it("is idempotent: a second --apply creates nothing and changes nothing", async () => {
    const before = await counts();
    const again = await seedDemo({ apply: true, password: PASSWORD, now: NOW });
    expect(again).toMatchObject({
      instructorsCreated: 0,
      instructorAccountsCreated: 0,
      clientsCreated: 0,
      templatesCreated: 0,
      sessionsCreated: 0,
      bookingsCreated: 0,
      waitlistCreated: 0,
      generatedPassword: null,
    });
    expect(await counts()).toEqual(before);
  });

  it("generates a password when none is given and returns it once", async () => {
    const real = await snapshotReal();
    await removeDemo({ apply: true });
    expect(await snapshotReal()).toEqual(real); // incl. the real user row
    const r = await seedDemo({ apply: true, now: NOW });
    expect(r.generatedPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(await signInCookie(`ani@${DEMO_DOMAIN}`, r.generatedPassword!)).toMatch(/session_token=/);
  });
});

describe("remove-demo", () => {
  it("dry-run deletes nothing and reports what it would delete", async () => {
    const before = await counts();
    const r = await removeDemo({ apply: false });
    expect(await counts()).toEqual(before);
    expect(r).toMatchObject({
      applied: false,
      sessions: before.sessions,
      bookings: before.bookings,
      waitlist: before.waitlist,
      templates: before.templates,
      instructors: before.instructors,
      users: before.users,
    });
  });

  it("refuses (and deletes nothing) while a REAL booking sits on a demo session", async () => {
    const [ds] = await db
      .select({ id: classSessions.id })
      .from(classSessions)
      .innerJoin(instructors, eq(instructors.id, classSessions.instructorId))
      .where(like(instructors.slug, "demo-%"))
      .limit(1);
    const [rb] = await db
      .insert(bookings)
      .values({ sessionId: ds.id, userId: `${tag}-rb`, userEmail: "someone@example.com", userPhone: "+359882222222" })
      .returning();
    const before = await counts();
    await expect(removeDemo({ apply: true })).rejects.toThrow(/real booking/);
    expect(await counts()).toEqual(before);
    await db.delete(bookings).where(eq(bookings.id, rb.id));
  });

  it("--apply removes every demo row and leaves real data untouched", async () => {
    const real = await snapshotReal();
    const r = await removeDemo({ apply: true });
    expect(r.sessions).toBe(80);
    expect(await counts()).toEqual({ instructors: 0, templates: 0, sessions: 0, bookings: 0, waitlist: 0, users: 0 });
    expect(await snapshotReal()).toEqual(real);
    const leftover = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(like(bookings.userEmail, `%@${DEMO_DOMAIN}`)));
    expect(leftover).toHaveLength(0);
    // and a second run is a no-op
    expect(await removeDemo({ apply: true })).toMatchObject({ sessions: 0, users: 0, instructors: 0 });
  });
});

describe("CLI", () => {
  const SLOW = 60_000;
  const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const run = (script: string, ...args: string[]) =>
    execFileAsync(process.execPath, [tsx, script, ...args], { cwd: process.cwd(), env: process.env }).then(
      (r) => ({ code: 0, out: r.stdout as string, err: r.stderr as string }),
      (e) => ({ code: typeof e.code === "number" ? e.code : 1, out: (e.stdout as string) ?? "", err: (e.stderr as string) ?? "" })
    );

  it("seed-demo without --apply is a dry run (exit 0, nothing written)", { timeout: SLOW }, async () => {
    const r = await run("scripts/seed-demo.ts");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/DRY RUN/);
    expect((await counts()).sessions).toBe(0);
  });

  it("seed-demo rejects a short --password with exit 1; remove-demo dry-run exits 0", { timeout: SLOW }, async () => {
    const bad = await run("scripts/seed-demo.ts", "--apply", "--password", "short");
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/at least 10/);
    expect((await counts()).sessions).toBe(0);
    const rm = await run("scripts/remove-demo.ts");
    expect(rm.code).toBe(0);
    expect(rm.out).toMatch(/DRY RUN/);
  });
});
