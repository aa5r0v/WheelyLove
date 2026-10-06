import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

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
  sports,
  user as userTable,
} from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import {
  getInstructorForSession,
  getInstructorSession,
  getMonthReport,
  listInstructorSessions,
  resolveMonth,
  setBookingAttendance,
} from "@/lib/instructor";
import { markAttendance } from "@/app/[locale]/instructor/actions";
import { linkInstructorAccess, removeInstructorAccess } from "@/app/[locale]/admin/actions";
import { DEFAULT_PASSWORD, deleteUser, signInCookie, signUpUser, verifyUserEmail } from "@/lib/test-helpers";

const db = getDb();
const tag = `ins-${Date.now()}`;
const HOUR = 3_600_000;
const userEmails: string[] = [];
const instructorIds: number[] = [];
const sessionIds: number[] = [];
let sportId: number;

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
    // Sign-in needs a verified email; un-verify afterwards (live session stays).
    await db.update(userTable).set({ emailVerified: false }).where(eq(userTable.id, u.id));
  }
  return { id: u.id, email, cookie };
}

async function makeInstructor(name: string, userId: string | null) {
  const [i] = await db
    .insert(instructors)
    .values({ slug: `${tag}-${name}`, name, userId })
    .returning();
  instructorIds.push(i.id);
  return i;
}

async function makeSession(
  instructorId: number,
  start: Date,
  o: { capacity?: number; priceCents?: number; cancelled?: boolean } = {}
) {
  const [s] = await db
    .insert(classSessions)
    .values({
      sportId,
      instructorId,
      startTime: start,
      endTime: new Date(start.getTime() + HOUR),
      capacity: o.capacity ?? 10,
      priceCents: o.priceCents ?? 1000,
      cancelledAt: o.cancelled ? new Date() : null,
    })
    .returning();
  sessionIds.push(s.id);
  return s;
}

async function makeBooking(
  sessionId: number,
  o: { status?: "pending" | "confirmed" | "cancelled"; attendance?: "unknown" | "attended" | "no_show" } = {}
) {
  const n = Math.random().toString(36).slice(2, 8);
  const [b] = await db
    .insert(bookings)
    .values({
      sessionId,
      userId: `${tag}-client-${n}`,
      userEmail: `${n}@test.local`,
      userPhone: "+359880000000",
      status: o.status ?? "confirmed",
      attendance: o.attendance ?? "unknown",
    })
    .returning();
  return b;
}

const attendanceOf = async (id: number) =>
  (await db.select({ a: bookings.attendance }).from(bookings).where(eq(bookings.id, id)))[0].a;

let A: Awaited<ReturnType<typeof makeInstructor>>;
let B: Awaited<ReturnType<typeof makeInstructor>>;
let ua: Awaited<ReturnType<typeof makeUser>>;
let ub: Awaited<ReturnType<typeof makeUser>>;
let sA: { past: { id: number }; future: { id: number } };
let sB: { past: { id: number }; future: { id: number } };
let bA: { id: number };
let bB: { id: number };

beforeAll(async () => {
  const [sp] = await db.insert(sports).values({ slug: `${tag}-sp`, name: "T" }).returning();
  sportId = sp.id;
  ua = await makeUser("a", "instructor");
  ub = await makeUser("b", "instructor");
  A = await makeInstructor("a", ua.id);
  B = await makeInstructor("b", ub.id);
  sA = {
    past: await makeSession(A.id, new Date(Date.now() - 2 * HOUR)),
    future: await makeSession(A.id, new Date(Date.now() + 24 * HOUR)),
  };
  sB = {
    past: await makeSession(B.id, new Date(Date.now() - 2 * HOUR)),
    future: await makeSession(B.id, new Date(Date.now() + 24 * HOUR)),
  };
  bA = await makeBooking(sA.past.id);
  bB = await makeBooking(sB.past.id);
});

afterAll(async () => {
  if (sessionIds.length) await db.delete(bookings).where(inArray(bookings.sessionId, sessionIds));
  if (sessionIds.length) await db.delete(classSessions).where(inArray(classSessions.id, sessionIds));
  if (instructorIds.length) await db.delete(instructors).where(inArray(instructors.id, instructorIds));
  await db.delete(sports).where(eq(sports.id, sportId));
  for (const e of userEmails) await deleteUser(e);
});

describe("getInstructorForSession", () => {
  it("is null without a session", async () => {
    as();
    expect(await getInstructorForSession()).toBeNull();
  });

  it("returns the linked instructor for a verified user with role instructor", async () => {
    as(ua.cookie);
    expect((await getInstructorForSession())?.id).toBe(A.id);
  });

  it("is null for a plain user, even when an instructor row points at him", async () => {
    const u = await makeUser("plain", "user");
    await makeInstructor("plain", u.id);
    as(u.cookie);
    expect(await getInstructorForSession()).toBeNull();
  });

  it("is null for an UNVERIFIED instructor (session is still alive)", async () => {
    const u = await makeUser("unver", "instructor", { verified: false });
    await makeInstructor("unver", u.id);
    as(u.cookie);
    expect(await getSession()).not.toBeNull(); // the session itself resolves...
    expect(await getInstructorForSession()).toBeNull(); // ...but gives no instructor
  });

  it("is null for role instructor without any linked instructors row", async () => {
    const u = await makeUser("nolink", "instructor");
    as(u.cookie);
    expect(await getInstructorForSession()).toBeNull();
  });

  it("an admin does not get instructor access automatically, even if linked", async () => {
    const u = await makeUser("adm", "admin");
    await makeInstructor("adm", u.id);
    as(u.cookie);
    expect(await getInstructorForSession()).toBeNull();
  });
});

describe("IDOR: instructor A vs instructor B", () => {
  it("lists only own sessions", async () => {
    const { upcoming, past } = await listInstructorSessions(A.id);
    const ids = [...upcoming, ...past].map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([sA.past.id, sA.future.id]));
    expect(ids).not.toContain(sB.past.id);
    expect(ids).not.toContain(sB.future.id);
  });

  it("session detail: own session is returned, B's session (by direct id) is null", async () => {
    const own = await getInstructorSession(A.id, sA.past.id);
    expect(own?.attendees.map((a) => a.id)).toEqual([bA.id]);
    expect(await getInstructorSession(A.id, sB.past.id)).toBeNull();
    expect(await getInstructorSession(A.id, sB.future.id)).toBeNull();
    expect(await getInstructorSession(A.id, -1)).toBeNull();
    expect(await getInstructorSession(A.id, 1.5)).toBeNull();
  });

  it("setBookingAttendance cannot touch B's booking, also not with A's own session id", async () => {
    expect(await setBookingAttendance(A.id, sB.past.id, bB.id, "attended")).toBe("not_found");
    expect(await setBookingAttendance(A.id, sA.past.id, bB.id, "attended")).toBe("not_found");
    expect(await attendanceOf(bB.id)).toBe("unknown");
  });

  it("markAttendance action: A marks own booking; the same call on B's booking is refused", async () => {
    as(ua.cookie);
    await markAttendance(sA.past.id, bA.id, "attended");
    expect(await attendanceOf(bA.id)).toBe("attended");

    await expect(markAttendance(sB.past.id, bB.id, "attended")).rejects.toThrow();
    await expect(markAttendance(sA.past.id, bB.id, "attended")).rejects.toThrow();
    expect(await attendanceOf(bB.id)).toBe("unknown");
    await markAttendance(sA.past.id, bA.id, "unknown");
  });

  it("refuses a plain user, an unverified instructor, an admin and no session", async () => {
    const plain = await makeUser("p2", "user");
    const unver = await makeUser("u2", "instructor", { verified: false });
    await makeInstructor("u2", unver.id);
    const adm = await makeUser("adm2", "admin");
    await makeInstructor("adm2", adm.id);
    for (const c of [plain.cookie, unver.cookie, adm.cookie, undefined]) {
      as(c);
      await expect(markAttendance(sA.past.id, bA.id, "attended")).rejects.toThrow("Нямаш достъп");
    }
    expect(await attendanceOf(bA.id)).toBe("unknown");
  });
});

describe("attendance rules", () => {
  it("refuses a session that has not started yet", async () => {
    const b = await makeBooking(sA.future.id);
    expect(await setBookingAttendance(A.id, sA.future.id, b.id, "attended")).toBe("not_started");
    as(ua.cookie);
    await expect(markAttendance(sA.future.id, b.id, "attended")).rejects.toThrow(/започнал/);
    expect(await attendanceOf(b.id)).toBe("unknown");
  });

  it("refuses a cancelled booking and a cancelled session", async () => {
    const cancelled = await makeBooking(sA.past.id, { status: "cancelled" });
    expect(await setBookingAttendance(A.id, sA.past.id, cancelled.id, "attended")).toBe("not_active");
    const cs = await makeSession(A.id, new Date(Date.now() - 3 * HOUR), { cancelled: true });
    const b = await makeBooking(cs.id);
    expect(await setBookingAttendance(A.id, cs.id, b.id, "attended")).toBe("not_active");
    expect(await attendanceOf(cancelled.id)).toBe("unknown");
    expect(await attendanceOf(b.id)).toBe("unknown");
  });

  it("validates the input of the action", async () => {
    as(ua.cookie);
    await expect(markAttendance(sA.past.id, bA.id, "hacked")).rejects.toThrow(/Невалидна/);
    await expect(markAttendance(sA.past.id, Number.NaN, "attended")).rejects.toThrow(/Невалидна/);
    await expect(markAttendance(-1, bA.id, "attended")).rejects.toThrow(/Невалиден/);
    await expect(markAttendance(sA.past.id, 1.5, "attended")).rejects.toThrow(/Невалидна/);
    expect(await attendanceOf(bA.id)).toBe("unknown");
  });
});

describe("monthly report (fixed data, now = 2031-05-20 12:00Z)", () => {
  const NOW = new Date("2031-05-20T12:00:00Z");
  let R: Awaited<ReturnType<typeof makeInstructor>>;
  let other: Awaited<ReturnType<typeof makeInstructor>>;

  beforeAll(async () => {
    R = await makeInstructor("rep", null);
    other = await makeInstructor("rep-other", null);
    const s1 = await makeSession(R.id, new Date("2031-05-10T10:00:00Z"), { capacity: 10, priceCents: 1000 });
    for (const attendance of ["attended", "attended", "attended", "no_show", "unknown"] as const) {
      await makeBooking(s1.id, { attendance });
    }
    await makeBooking(s1.id, { status: "cancelled", attendance: "attended" }); // not counted
    const s2 = await makeSession(R.id, new Date("2031-05-11T10:00:00Z"), { capacity: 5, priceCents: 2000 });
    await makeBooking(s2.id, { attendance: "attended" });
    await makeBooking(s2.id, { status: "pending", attendance: "attended" });
    // 00:30 Sofia on 1 May (UTC+3) = still April in UTC: belongs to May.
    const edgeIn = await makeSession(R.id, new Date("2031-04-30T21:30:00Z"), { capacity: 5, priceCents: 500 });
    await makeBooking(edgeIn.id, { attendance: "attended" });
    // 00:30 Sofia on 1 June = still May in UTC: belongs to June, not May.
    const edgeOut = await makeSession(R.id, new Date("2031-05-31T21:30:00Z"), { capacity: 5, priceCents: 500 });
    await makeBooking(edgeOut.id, { attendance: "attended" });
    // excluded: cancelled session, future session, other instructor
    const cs = await makeSession(R.id, new Date("2031-05-12T10:00:00Z"), { cancelled: true });
    await makeBooking(cs.id, { attendance: "attended" });
    const fut = await makeSession(R.id, new Date("2031-05-25T10:00:00Z"));
    await makeBooking(fut.id);
    const o = await makeSession(other.id, new Date("2031-05-10T10:00:00Z"));
    await makeBooking(o.id, { attendance: "attended" });
  });

  it("counts held sessions, bookings, attendance, fill % and attended revenue", async () => {
    expect(await getMonthReport(R.id, "2031-05", NOW)).toEqual({
      month: "2031-05",
      sessions: 3,
      booked: 8,
      attended: 6,
      noShow: 1,
      fillPercent: 40, // 8 active bookings / (10 + 5 + 5) capacity
      revenueCents: 3 * 1000 + 2 * 2000 + 500,
    });
  });

  it("only the instructor's own sessions: the other instructor sees only his", async () => {
    const r = await getMonthReport(other.id, "2031-05", NOW);
    expect([r.sessions, r.booked, r.attended]).toEqual([1, 1, 1]);
  });

  it("an empty month is all zeros; month input is validated", async () => {
    expect(await getMonthReport(R.id, "2031-03", NOW)).toMatchObject({ sessions: 0, booked: 0, fillPercent: 0 });
    await expect(getMonthReport(R.id, "2031-13", NOW)).rejects.toThrow();
    expect(resolveMonth("garbage", NOW)).toBe("2031-05");
    expect(resolveMonth("2031-02", NOW)).toBe("2031-02");
  });
});

describe("admin: link / unlink an account", () => {
  async function adminCookie(name: string) {
    return (await makeUser(name, "admin")).cookie;
  }
  const form = (email: string) => {
    const f = new FormData();
    f.set("email", email);
    return f;
  };
  const roleOf = async (id: string) =>
    (await db.select({ r: userTable.role }).from(userTable).where(eq(userTable.id, id)))[0].r;
  const linkOf = async (id: number) =>
    (await db.select({ u: instructors.userId }).from(instructors).where(eq(instructors.id, id)))[0].u;

  it("a non-admin cannot link or unlink", async () => {
    const t = await makeInstructor("lk1", null);
    const target = await makeUser("lk1-user", "user");
    const plain = await makeUser("lk1-plain", "user");
    as(plain.cookie);
    await expect(linkInstructorAccess(t.id, form(target.email))).rejects.toThrow("администратор");
    await expect(removeInstructorAccess(t.id)).rejects.toThrow("администратор");
    as(ua.cookie); // an instructor is not an admin either
    await expect(linkInstructorAccess(t.id, form(target.email))).rejects.toThrow("администратор");
    expect(await linkOf(t.id)).toBeNull();
    expect(await roleOf(target.id)).toBe("user");
  });

  it("an admin links a verified account (role + link) and unlinks it again", async () => {
    const t = await makeInstructor("lk2", null);
    const target = await makeUser("lk2-user", "user");
    as(await adminCookie("lk2-admin"));
    const r = await linkInstructorAccess(t.id, form(target.email.toUpperCase()));
    expect(r.error).toBeUndefined();
    expect(await roleOf(target.id)).toBe("instructor");
    expect(await linkOf(t.id)).toBe(target.id);

    // Linking signs the account out; after a fresh password the access works.
    as(target.cookie);
    expect(await getInstructorForSession()).toBeNull();
    await db
      .update(accountTable)
      .set({ password: await hashPassword("fresh-password-123456") })
      .where(eq(accountTable.userId, target.id));
    as(await signInCookie(target.email, "fresh-password-123456"));
    expect((await getInstructorForSession())?.id).toBe(t.id);

    as(await adminCookie("lk2-admin2"));
    await removeInstructorAccess(t.id);
    expect(await roleOf(target.id)).toBe("user");
    expect(await linkOf(t.id)).toBeNull();
    as(target.cookie);
    expect(await getInstructorForSession()).toBeNull();
  });

  it("refuses an admin account with a clear error and changes nothing", async () => {
    const t = await makeInstructor("lk3", null);
    const victim = await makeUser("lk3-admin", "admin");
    as(await adminCookie("lk3-caller"));
    const r = await linkInstructorAccess(t.id, form(victim.email));
    expect(r.error).toMatch(/Администраторски акаунт/);
    expect(await roleOf(victim.id)).toBe("admin");
    expect(await linkOf(t.id)).toBeNull();
  });

  it("refuses an unverified account, an unknown email, a taken instructor and a doubly linked account", async () => {
    const t = await makeInstructor("lk4", null);
    const unver = await makeUser("lk4-unver", "user", { verified: false });
    as(await adminCookie("lk4-caller"));
    expect((await linkInstructorAccess(t.id, form(unver.email))).error).toMatch(/не е потвърден/);
    expect((await linkInstructorAccess(t.id, form(`${tag}-nobody@test.local`))).error).toMatch(/Няма регистриран/);
    // A already has an account
    expect((await linkInstructorAccess(A.id, form(ub.email))).error).toMatch(/вече е свързан/);
    // ub is already B: cannot also become t
    expect((await linkInstructorAccess(t.id, form(ub.email))).error).toMatch(/вече е свързан с друг/);
    expect(await linkOf(t.id)).toBeNull();
    expect(await roleOf(unver.id)).toBe("user");
  });
});

describe("pre-registration takeover (H1) and access removal (L3)", () => {
  const form = (email: string) => {
    const f = new FormData();
    f.set("email", email);
    return f;
  };
  const sessionsOf = async (id: string) =>
    (await db.select().from(sessionTable).where(eq(sessionTable.userId, id))).length;
  const passwordOf = async (id: string) =>
    (await db.select({ p: accountTable.password }).from(accountTable).where(eq(accountTable.userId, id)))[0].p;
  const adminCookie = async (n: string) => (await makeUser(n, "admin")).cookie;

  it("web link: the old password no longer signs in and old sessions are deleted", async () => {
    const t = await makeInstructor("h1w", null);
    const attacker = await makeUser("h1w-victim", "user"); // registered by the attacker, email verified by the owner
    expect(await sessionsOf(attacker.id)).toBeGreaterThan(0);
    as(await adminCookie("h1w-admin"));
    const r = await linkInstructorAccess(t.id, form(attacker.email));
    expect(r.ok).toMatch(/Забравена парола/);
    expect(await sessionsOf(attacker.id)).toBe(0);
    expect(await passwordOf(attacker.id)).toBeNull();
    await expect(signInCookie(attacker.email, DEFAULT_PASSWORD)).rejects.toThrow();
    await expect(
      getAuth().api.signInEmail({ body: { email: attacker.email, password: DEFAULT_PASSWORD }, headers: new Headers() })
    ).rejects.toThrow();
  });

  it("re-linking the account that is already linked to the same instructor keeps password and sessions", async () => {
    const t = await makeInstructor("h1same", null);
    const u = await makeUser("h1same-user", "user");
    as(await adminCookie("h1same-admin"));
    await linkInstructorAccess(t.id, form(u.email));
    await db
      .update(accountTable)
      .set({ password: await hashPassword("fresh-password-123456") })
      .where(eq(accountTable.userId, u.id));
    await signInCookie(u.email, "fresh-password-123456");
    const before = await sessionsOf(u.id);
    const r = await linkInstructorAccess(t.id, form(u.email));
    expect(r.error).toBeUndefined();
    expect(await passwordOf(u.id)).not.toBeNull();
    expect(await sessionsOf(u.id)).toBe(before);
  });

  it("removing the access deletes the account's sessions", async () => {
    const t = await makeInstructor("l3", null);
    const u = await makeUser("l3-user", "user");
    as(await adminCookie("l3-admin"));
    await linkInstructorAccess(t.id, form(u.email));
    await db
      .update(accountTable)
      .set({ password: await hashPassword("fresh-password-123456") })
      .where(eq(accountTable.userId, u.id));
    await signInCookie(u.email, "fresh-password-123456");
    expect(await sessionsOf(u.id)).toBeGreaterThan(0);
    await removeInstructorAccess(t.id);
    expect(await sessionsOf(u.id)).toBe(0);
  });
});
