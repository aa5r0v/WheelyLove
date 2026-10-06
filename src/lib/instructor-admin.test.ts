import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

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

// Server actions resolve the session through next/headers.
const headerState = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => headerState.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDb } from "@/db";
import { hashPassword } from "better-auth/crypto";
import {
  account as accountTable,
  bookings,
  classSessions,
  instructors,
  session as sessionTable,
  sessionTemplates,
  sports,
  user as userTable,
} from "@/db/schema";
import {
  archiveInstructor,
  createInstructor,
  createSession,
  createTemplate,
  deleteInstructor,
  linkInstructorAccess,
  restoreInstructor,
  updateInstructor,
  updateSession,
  updateTemplate,
} from "@/app/[locale]/admin/actions";
import { getInstructorForSession } from "@/lib/instructor";
import { linkInstructorAccount } from "@/lib/instructor-link";
import { generateSessions, isoWeekday } from "@/lib/schedule-generator";
import { toSofiaDateInput } from "@/lib/format";
import { deleteUser, signInCookie, signUpUser, verifyUserEmail } from "@/lib/test-helpers";

const db = getDb();
const tag = `insadm-${Date.now()}`;
const HOUR = 3_600_000;
const userEmails: string[] = [];
const instructorIds: number[] = [];
const sessionIds: number[] = [];
const templateIds: number[] = [];
const bookingIds: number[] = [];
let sportId: number;

// Fixed "now" in the future so nothing collides with real data or DST edges:
// 2031-08-04 06:00Z = 09:00 Sofia, a Monday; 10:00 Sofia same day is still ahead.
const NOW = new Date("2031-08-04T06:00:00Z");
const NEXT_MONDAY_DATE = "2031-08-04";

const as = (cookie?: string) => {
  headerState.headers = cookie ? new Headers({ cookie }) : new Headers();
};

// A real Better Auth account (verified, signed in) with the given role.
async function makeUser(name: string, role: string, opts: { verified?: boolean } = {}) {
  const email = `${tag}-${name}@test.local`;
  userEmails.push(email);
  const u = await signUpUser({ email });
  await verifyUserEmail(email);
  await db.update(userTable).set({ role }).where(eq(userTable.id, u.id));
  const cookie = await signInCookie(email);
  if (opts.verified === false) {
    await db.update(userTable).set({ emailVerified: false }).where(eq(userTable.id, u.id));
  }
  return { id: u.id, email, cookie };
}

async function makeInstructor(
  name: string,
  o: { userId?: string | null; photoUrl?: string } = {}
) {
  const [i] = await db
    .insert(instructors)
    .values({
      slug: `${tag}-${name}`,
      name,
      bio: "Старо био.",
      photoUrl: o.photoUrl ?? null,
      userId: o.userId ?? null,
    })
    .returning();
  instructorIds.push(i.id);
  return i;
}

async function makeSession(instructorId: number, start: Date) {
  const [s] = await db
    .insert(classSessions)
    .values({
      sportId,
      instructorId,
      startTime: start,
      endTime: new Date(start.getTime() + HOUR),
      capacity: 10,
      priceCents: 1000,
    })
    .returning();
  sessionIds.push(s.id);
  return s;
}

async function makeTemplate(instructorId: number, o: { active?: boolean } = {}) {
  const [t] = await db
    .insert(sessionTemplates)
    .values({
      sportId,
      instructorId,
      weekday: isoWeekday(NEXT_MONDAY_DATE),
      startTime: "10:00",
      durationMin: 60,
      capacity: 10,
      priceCents: 1000,
      active: o.active ?? true,
    })
    .returning();
  templateIds.push(t.id);
  return t;
}

async function makeBooking(sessionId: number) {
  const n = Math.random().toString(36).slice(2, 8);
  const [b] = await db
    .insert(bookings)
    .values({
      sessionId,
      userId: `${tag}-client-${n}`,
      userEmail: `${n}@test.local`,
      userPhone: "+359880000000",
      status: "confirmed",
    })
    .returning({ id: bookings.id });
  bookingIds.push(b.id);
  return b;
}

const form = (entries: Record<string, string | number>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, String(v));
  return f;
};

const profileForm = (o: Record<string, string | number> = {}) =>
  form({
    name: "Валидно Име",
    slug: `${tag}-auto-${Math.random().toString(36).slice(2, 6)}`,
    ...o,
  });

const sessionEntries = (instructorId: number) => ({
  sportId,
  instructorId,
  date: "2031-08-05",
  startTime: "10:00",
  endTime: "11:00",
  capacity: 10,
  price: "10",
});
const sessionForm = (instructorId: number) => form(sessionEntries(instructorId));

const templateEntries = (instructorId: number) => ({
  sportId,
  instructorId,
  weekday: isoWeekday(NEXT_MONDAY_DATE),
  startTime: "10:00",
  durationMin: 60,
  capacity: 10,
  price: "10",
});
const templateForm = (instructorId: number) => form(templateEntries(instructorId));

const row = async (id: number) =>
  (await db.select().from(instructors).where(eq(instructors.id, id)))[0];

const roleOf = async (id: string) =>
  (await db.select({ r: userTable.role }).from(userTable).where(eq(userTable.id, id)))[0].r;

const sessionsOf = async (id: string) =>
  (await db.select({ id: sessionTable.id }).from(sessionTable).where(eq(sessionTable.userId, id)))
    .length;

// Sign in with a fresh password after a link reset the credential.
async function freshCookie(email: string) {
  const u = (await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email)))[0];
  await db
    .update(accountTable)
    .set({ password: await hashPassword("fresh-password-123456") })
    .where(eq(accountTable.userId, u.id));
  return signInCookie(email, "fresh-password-123456");
}

let adminCookie: string;
// E: edit target; O: duplicate-slug other; D: unreferenced delete target;
// R: referenced; A: archive target; W: archived with session+template.
let E: Awaited<ReturnType<typeof makeInstructor>>;
let O: Awaited<ReturnType<typeof makeInstructor>>;
let A: Awaited<ReturnType<typeof makeInstructor>>;
let W: Awaited<ReturnType<typeof makeInstructor>>;
let ua: Awaited<ReturnType<typeof makeUser>>; // A's linked instructor account

beforeAll(async () => {
  const [sp] = await db.insert(sports).values({ slug: `${tag}-sp`, name: "T" }).returning();
  sportId = sp.id;
  adminCookie = (await makeUser("admin", "admin")).cookie;
  E = await makeInstructor("edi", { photoUrl: "/sports/test.jpg" });
  O = await makeInstructor("other");
});

afterAll(async () => {
  if (bookingIds.length)
    await db.delete(bookings).where(inArray(bookings.id, bookingIds));
  if (sessionIds.length)
    await db.delete(classSessions).where(inArray(classSessions.id, sessionIds));
  if (templateIds.length)
    await db.delete(sessionTemplates).where(inArray(sessionTemplates.id, templateIds));
  if (instructorIds.length)
    await db.delete(instructors).where(inArray(instructors.id, instructorIds));
  if (sportId) await db.delete(sports).where(eq(sports.id, sportId));
  for (const e of userEmails) await deleteUser(e);
});

describe("updateInstructor: profile validation", () => {
  beforeAll(() => {
    as(adminCookie);
  });

  it("rejects a missing/overlong name and overlong specialties/phone", async () => {
    expect((await updateInstructor(E.id, profileForm({ name: "   " }))).errors?.name).toMatch(
      /Въведи име/
    );
    expect(
      (await updateInstructor(E.id, profileForm({ name: "x".repeat(129) }))).errors?.name
    ).toMatch(/128 символа/);
    expect(
      (await updateInstructor(E.id, profileForm({ specialties: "s".repeat(257) }))).errors
        ?.specialties
    ).toMatch(/256 символа/);
    expect(
      (await updateInstructor(E.id, profileForm({ phone: "p".repeat(33) }))).errors?.phone
    ).toMatch(/32 символа/);
  });

  it("rejects non-canonical and overlong slugs", async () => {
    for (const bad of ["Ани", "Ani", "ani_", "ani x", "-ani", "ani-", "ani--x"]) {
      expect((await updateInstructor(E.id, profileForm({ slug: bad }))).errors?.slug).toMatch(
        /малки букви/
      );
    }
    expect((await updateInstructor(E.id, profileForm({ slug: "a".repeat(65) }))).errors?.slug).toMatch(
      /64 символа/
    );
  });

  it("rejects a malformed email", async () => {
    expect((await updateInstructor(E.id, profileForm({ email: "nope" }))).errors?.email).toMatch(
      /Невалиден имейл/
    );
  });

  it("rejects a slug taken by ANOTHER instructor, but keeps its own", async () => {
    expect((await updateInstructor(E.id, profileForm({ slug: O.slug }))).errors?.slug).toMatch(
      /вече се използва/
    );
    const keep = await updateInstructor(E.id, profileForm({ slug: E.slug }));
    expect(keep.errors?.slug).toBeUndefined();
    expect(keep.ok).toBeTruthy();
  });

  it("saves a valid update: trims, updates all profile fields, preserves photoUrl and never mass-assigns", async () => {
    const otherUser = await makeUser("mass", "user");
    const r = await updateInstructor(
      E.id,
      profileForm({
        name: "  Ново Име  ",
        slug: `${tag}-edi-new`,
        specialties: " Йога ",
        phone: " +359888 ",
        email: "new@test.local ",
        bio: " Ново био ",
        userId: otherUser.id, // must be ignored
        role: "admin", // must be ignored
        archivedAt: "2031-01-01", // must be ignored
      })
    );
    expect(r.ok).toBeTruthy();
    const after = await row(E.id);
    expect(after.name).toBe("Ново Име");
    expect(after.slug).toBe(`${tag}-edi-new`);
    expect(after.specialties).toBe("Йога");
    expect(after.phone).toBe("+359888");
    expect(after.email).toBe("new@test.local");
    expect(after.bio).toBe("Ново био");
    expect(after.photoUrl).toBe("/sports/test.jpg"); // preserved, not in the form
    expect(after.userId).toBeNull(); // never from the form
    expect(after.archivedAt).toBeNull();
    expect(await roleOf(otherUser.id)).toBe("user");
    // slug detail path changes: E.slug is now the new one
    expect(E.slug).not.toBe(after.slug);
  });

  it("returns readable errors for unknown or invalid ids", async () => {
    expect((await updateInstructor(987654321, profileForm())).error).toMatch(/не съществува/);
    for (const bad of [0, -1, 1.5]) {
      expect((await updateInstructor(bad as number, profileForm())).error).toMatch(/Невалиден/);
    }
  });

  it("refuses to edit an archived instructor until restored", async () => {
    const X = await makeInstructor("arch-edit");
    await db.update(instructors).set({ archivedAt: new Date() }).where(eq(instructors.id, X.id));
    expect((await updateInstructor(X.id, profileForm())).error).toMatch(/архивиран/);
    await db.update(instructors).set({ archivedAt: null }).where(eq(instructors.id, X.id));
  });
});

describe("createInstructor", () => {
  beforeAll(() => {
    as(adminCookie);
  });

  it("validates like the edit form", async () => {
    expect((await createInstructor(profileForm({ name: "" }))).errors?.name).toBeTruthy();
    expect((await createInstructor(profileForm({ slug: "НО!" }))).errors?.slug).toBeTruthy();
  });

  it("duplicate slug is a readable error, not a crash; nothing is inserted", async () => {
    const before = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(instructors)
      .where(eq(instructors.slug, O.slug));
    const r = await createInstructor(profileForm({ slug: O.slug }));
    expect(r.error).toMatch(/вече се използва/);
    const after = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(instructors)
      .where(eq(instructors.slug, O.slug));
    expect(after[0].n).toBe(before[0].n);
  });

  it("creates the instructor with trimmed values", async () => {
    const slug = `${tag}-created`;
    const r = await createInstructor(profileForm({ name: "  Създаден  ", slug }));
    expect(r.ok).toBeTruthy();
    const [created] = await db.select().from(instructors).where(eq(instructors.slug, slug));
    expect(created.name).toBe("Създаден");
    instructorIds.push(created.id);
  });
});

describe("deleteInstructor", () => {
  beforeAll(() => {
    as(adminCookie);
  });

  it("referenced by a session: readable error offering archive, row stays", async () => {
    const R = await makeInstructor("ref-sess");
    const s = await makeSession(R.id, new Date(NOW.getTime() + 24 * HOUR));
    const r = await deleteInstructor(R.id);
    expect(r.error).toMatch(/не може да бъде изтрит/);
    expect(r.error).toMatch(/Архивирай/);
    expect(await row(R.id)).toBeTruthy();
    // cleanup this session so R can be removed at teardown
    await db.delete(classSessions).where(eq(classSessions.id, s.id));
    sessionIds.splice(sessionIds.indexOf(s.id), 1);
  });

  it("referenced by a template only: same readable refusal", async () => {
    const R = await makeInstructor("ref-tpl");
    const t = await makeTemplate(R.id);
    const r = await deleteInstructor(R.id);
    expect(r.error).toMatch(/не може да бъде изтрит/);
    expect(await row(R.id)).toBeTruthy();
    await db.delete(sessionTemplates).where(eq(sessionTemplates.id, t.id));
    templateIds.splice(templateIds.indexOf(t.id), 1);
  });

  it("unreferenced: deletes permanently, unlinks the account (role back to user, sessions revoked) and never deletes the account", async () => {
    const D = await makeInstructor("del");
    const du = await makeUser("del-user", "user");
    await linkInstructorAccess(D.id, form({ email: du.email }));
    const duCookie = await freshCookie(du.email);
    expect(await sessionsOf(du.id)).toBeGreaterThan(0);
    expect(await roleOf(du.id)).toBe("instructor");

    const r = await deleteInstructor(D.id);
    expect(r.ok).toBeTruthy();
    expect(await row(D.id)).toBeUndefined();
    expect(await roleOf(du.id)).toBe("user");
    expect(await sessionsOf(du.id)).toBe(0);
    const stillThere = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, du.id));
    expect(stillThere.length).toBe(1); // the account itself survives
    instructorIds.splice(instructorIds.indexOf(D.id), 1);
    as(adminCookie);
    expect(duCookie).toBeTruthy();
  });

  it("unknown id: readable error", async () => {
    expect((await deleteInstructor(987654321)).error).toMatch(/не съществува/);
  });
});

describe("archiveInstructor", () => {
  let tpl: Awaited<ReturnType<typeof makeTemplate>>;
  let sess: Awaited<ReturnType<typeof makeSession>>;
  let booking: { id: number };

  beforeAll(async () => {
    as(adminCookie);
    A = await makeInstructor("arch");
    ua = await makeUser("arch-user", "user");
    tpl = await makeTemplate(A.id);
    sess = await makeSession(A.id, new Date(NOW.getTime() + 48 * HOUR));
    booking = await makeBooking(sess.id);
    await linkInstructorAccess(A.id, form({ email: ua.email }));
    await freshCookie(ua.email); // creates a real login session for ua
  });

  it("archives atomically: classes/bookings/templates stay, templates deactivate, panel access is removed", async () => {
    expect(await sessionsOf(ua.id)).toBeGreaterThan(0);
    const r = await archiveInstructor(A.id);
    expect(r.ok).toMatch(/архивиран/);

    const after = await row(A.id);
    expect(after.archivedAt).not.toBeNull();
    expect(after.userId).toBeNull();

    // History is preserved exactly: session, booking, template rows unchanged.
    const s = await db.select().from(classSessions).where(eq(classSessions.id, sess.id));
    expect(s.length).toBe(1);
    const b = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.length).toBe(1);
    expect(b[0].status).toBe("confirmed");
    const t = await db.select().from(sessionTemplates).where(eq(sessionTemplates.id, tpl.id));
    expect(t.length).toBe(1);
    expect(t[0].active).toBe(false); // generation stops
    expect(t[0].instructorId).toBe(A.id); // row itself untouched

    // Panel access gone: sessions revoked, role back to user, account alive.
    expect(await sessionsOf(ua.id)).toBe(0);
    expect(await roleOf(ua.id)).toBe("user");
    expect(await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, ua.id))).toHaveLength(1);
  });

  it("never demotes an account that became admin while linked", async () => {
    const L = await makeInstructor("arch-admin");
    const ul = await makeUser("arch-admin-user", "user");
    await linkInstructorAccess(L.id, form({ email: ul.email }));
    await freshCookie(ul.email);
    await db.update(userTable).set({ role: "admin" }).where(eq(userTable.id, ul.id));
    await archiveInstructor(L.id);
    expect(await roleOf(ul.id)).toBe("admin"); // untouched
    expect(await sessionsOf(ul.id)).toBe(0); // sessions still revoked
    expect((await row(L.id)).userId).toBeNull();
  });

  it("twice: readable error", async () => {
    expect((await archiveInstructor(A.id)).error).toMatch(/вече е архивиран/);
  });

  it("unknown id: readable error", async () => {
    expect((await archiveInstructor(987654321)).error).toMatch(/не съществува/);
  });
});

describe("restoreInstructor", () => {
  it("clears archived_at only: no account relink, no template re-activation", async () => {
    as(adminCookie);
    const r = await restoreInstructor(A.id);
    expect(r.ok).toMatch(/възстановен/);
    const after = await row(A.id);
    expect(after.archivedAt).toBeNull();
    expect(after.userId).toBeNull(); // restore does NOT silently relink access
    const tpl = await db
      .select({ active: sessionTemplates.active })
      .from(sessionTemplates)
      .where(eq(sessionTemplates.instructorId, A.id));
    expect(tpl.every((t) => t.active === false)).toBe(true); // stays off
  });

  it("not archived: readable error", async () => {
    expect((await restoreInstructor(E.id)).error).toMatch(/не е архивиран/);
  });
});

describe("guards on archived rows", () => {
  let gu: Awaited<ReturnType<typeof makeUser>>; // instructor-role user linked to G
  let G: Awaited<ReturnType<typeof makeInstructor>>;
  let ws: Awaited<ReturnType<typeof makeSession>>;
  let es: Awaited<ReturnType<typeof makeSession>>;
  let wt: Awaited<ReturnType<typeof makeTemplate>>;

  beforeAll(async () => {
    as(adminCookie);
    G = await makeInstructor("guard");
    gu = await makeUser("guard-user", "user");
    await linkInstructorAccess(G.id, form({ email: gu.email }));
    // Simulate an archive that (buggily) left the link: the READ must still refuse.
    await db.update(instructors).set({ archivedAt: new Date() }).where(eq(instructors.id, G.id));

    W = await makeInstructor("arch-sched");
    await db.update(instructors).set({ archivedAt: new Date() }).where(eq(instructors.id, W.id));
    ws = await makeSession(W.id, new Date(NOW.getTime() + 72 * HOUR));
    wt = await makeTemplate(W.id, { active: false });
    es = await makeSession(E.id, new Date(NOW.getTime() + 72 * HOUR));
  });

  it("getInstructorForSession is null for a linked-but-archived instructor", async () => {
    as(await freshCookie(gu.email));
    expect(await getInstructorForSession()).toBeNull();
  });

  it("linkInstructorAccount refuses an archived instructor (action and lib)", async () => {
    as(adminCookie);
    const candidate = await makeUser("cand", "user");
    const r = await linkInstructorAccess(W.id, form({ email: candidate.email }));
    expect(r.error).toMatch(/архивиран/);
    expect(await roleOf(candidate.id)).toBe("user");
    expect((await row(W.id)).userId).toBeNull();
    const direct = await linkInstructorAccount({ email: candidate.email, instructor: { id: W.id } });
    expect(direct.ok).toBe(false);
  });

  it("createSession refuses an archived instructor and inserts nothing", async () => {
    as(adminCookie);
    const before = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(classSessions)
      .where(eq(classSessions.instructorId, W.id));
    await expect(createSession(sessionForm(W.id))).rejects.toThrow(/не е наличен/);
    const after = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(classSessions)
      .where(eq(classSessions.instructorId, W.id));
    expect(after[0].n).toBe(before[0].n);
  });

  it("updateSession: keeping the archived instructor is allowed, reassigning TO him is not", async () => {
    as(adminCookie);
    await expect(
      updateSession(ws.id, form({ ...sessionEntries(W.id), date: "2031-08-06" }))
    ).resolves.toBeUndefined();
    const stillW = await db
      .select({ i: classSessions.instructorId })
      .from(classSessions)
      .where(eq(classSessions.id, ws.id));
    expect(stillW[0].i).toBe(W.id);

    await expect(
      updateSession(ws.id, form({ ...sessionEntries(E.id), date: "2031-08-06" }))
    ).resolves.toBeUndefined(); // to an ACTIVE one: fine

    await expect(updateSession(es.id, sessionForm(W.id))).rejects.toThrow(/не е наличен/);
  });

  it("templates: create for archived refused; activation on archived refused even with unchanged id; inactive edit of the unchanged archived instructor stays allowed", async () => {
    as(adminCookie);
    await expect(createTemplate(templateForm(W.id))).rejects.toThrow(/не е наличен/);
    await expect(
      updateTemplate(wt.id, form({ ...templateEntries(W.id), active: "on" }))
    ).rejects.toThrow(/не е наличен/); // activating an archived instructor's template is refused even when the id is unchanged
    await expect(
      updateTemplate(wt.id, form({ ...templateEntries(W.id), capacity: 9 }))
    ).resolves.toBeUndefined(); // INACTIVE edit with the unchanged archived instructor: existing rows stay editable

    const et = await makeTemplate(E.id);
    await expect(
      updateTemplate(et.id, form({ ...templateEntries(E.id), active: "on" }))
    ).resolves.toBeUndefined(); // active instructor: (re)activation is fine
    await expect(updateTemplate(et.id, templateForm(W.id))).rejects.toThrow(/не е наличен/);
  });

  it("the schedule generator creates nothing for an archived instructor, even with an active template", async () => {    as(adminCookie);
    // Force W's template active again (as manual SQL would): the generator
    // itself must still skip the archived instructor...
    await db.update(sessionTemplates).set({ active: true }).where(eq(sessionTemplates.id, wt.id));
    const before = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(classSessions)
      .where(eq(classSessions.instructorId, W.id));
    const result = await generateSessions({ templateIds: [wt.id], now: NOW });
    const after = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(classSessions)
      .where(eq(classSessions.instructorId, W.id));
    expect(after[0].n).toBe(before[0].n);
    expect(result.created).toBe(0);

    // ...while the SAME call for an active instructor's template does create.
    const et = await db
      .select({ id: sessionTemplates.id })
      .from(sessionTemplates)
      .where(and(eq(sessionTemplates.instructorId, E.id), eq(sessionTemplates.active, true)));
    const control = await generateSessions({ templateIds: [et[0].id], now: NOW });
    expect(control.created).toBeGreaterThan(0);
    // generated rows are not in sessionIds: remove them right away
    await db
      .delete(classSessions)
      .where(and(eq(classSessions.templateId, et[0].id), eq(classSessions.instructorId, E.id)));
  });
});

describe("auth: every instructor action refuses non-admins BEFORE touching the DB", () => {
  const nameBefore = async () => (await row(E.id)).name;
  const archivedBefore = async () => (await row(E.id)).archivedAt;

  it("guest, client, instructor and unverified admin are all refused with no mutation", async () => {
    const client = await makeUser("auth-client", "user");
    const ins = await makeUser("auth-ins", "instructor");
    const unverifiedAdmin = await makeUser("auth-unver", "admin", { verified: false });

    const name = await nameBefore();
    const archived = await archivedBefore();
    // Scoped to this file's slug prefix: another test file may insert its own
    // instructors in a parallel worker on the shared test database.
    const ownCount = async () =>
      (
        await db
          .select({ n: sql<number>`count(*)::int` })
          .from(instructors)
          .where(sql`slug like ${tag + "-%"}`)
      )[0].n;
    const countBefore = await ownCount();

    for (const cookie of [undefined, client.cookie, ins.cookie, unverifiedAdmin.cookie]) {
      as(cookie);
      await expect(
        updateInstructor(E.id, profileForm({ name: "Хакнат", slug: E.slug }))
      ).rejects.toThrow("Нямаш права за администратор.");
      await expect(createInstructor(profileForm())).rejects.toThrow(
        "Нямаш права за администратор."
      );
      await expect(deleteInstructor(E.id)).rejects.toThrow(
        "Нямаш права за администратор."
      );
      await expect(archiveInstructor(E.id)).rejects.toThrow(
        "Нямаш права за администратор."
      );
      await expect(restoreInstructor(E.id)).rejects.toThrow(
        "Нямаш права за администратор."
      );
      await expect(createSession(sessionForm(E.id))).rejects.toThrow(
        "Нямаш права за администратор."
      );
    }

    expect(await nameBefore()).toBe(name);
    expect(await archivedBefore()).toBe(archived);
    const countAfter = await ownCount();
    expect(countAfter).toBe(countBefore);
    as(); // leave no cookie behind
  });

  it("today's Sofia date sanity for the fixed NOW used above", () => {
    // Guards the generator fixture: 2031-08-04 must parse and be in the future
    // relative to nothing (fixed), only asserting isoWeekday is a valid 1..7.
    expect(isoWeekday(NEXT_MONDAY_DATE)).toBeGreaterThanOrEqual(1);
    expect(isoWeekday(NEXT_MONDAY_DATE)).toBeLessThanOrEqual(7);
    expect(toSofiaDateInput(NOW)).toBe(NEXT_MONDAY_DATE);
  });
});
