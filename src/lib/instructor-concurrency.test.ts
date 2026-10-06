import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";
import { eq, inArray, sql } from "drizzle-orm";

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
  classSessions,
  instructors,
  sessionTemplates,
  sports,
  user as userTable,
} from "@/db/schema";
import { createSession, updateSession, updateTemplate } from "@/app/[locale]/admin/actions";
import { archiveInstructorRow } from "@/lib/instructor-lifecycle";
import { linkInstructorAccount } from "@/lib/instructor-link";
import { generateSessions, isoWeekday } from "@/lib/schedule-generator";
import { deleteUser, signInCookie, signUpUser, verifyUserEmail } from "@/lib/test-helpers";

// Deterministic archive-race tests. Every interleaving is forced with real row
// locks on a separate connection and observed through pg_locks (a backend
// queued on a specific transaction id), never through sleeps: a poll loop with
// a deadline only guards failure, the pass condition is the lock waiter
// itself.

const db = getDb();
const tag = `inscon-${Date.now()}`;
const HOUR = 3_600_000;
const userEmails: string[] = [];
const instructorIds: number[] = [];
let sportId: number;

// Fixed "now" in the future: 2031-08-04 06:00Z = 09:00 Sofia, a Monday; 10:00
// Sofia the same day is still ahead, so a Monday 10:00 template plans one
// session per week.
const NOW = new Date("2031-08-04T06:00:00Z");
const NEXT_MONDAY_DATE = "2031-08-04";

const as = (cookie?: string) => {
  headerState.headers = cookie ? new Headers({ cookie }) : new Headers();
};

async function makeUser(name: string, role: string) {
  const email = `${tag}-${name}@test.local`;
  userEmails.push(email);
  const u = await signUpUser({ email });
  await verifyUserEmail(email);
  await db.update(userTable).set({ role }).where(eq(userTable.id, u.id));
  const cookie = await signInCookie(email);
  return { id: u.id, email, cookie };
}

async function makeInstructor(name: string) {
  const [i] = await db
    .insert(instructors)
    .values({ slug: `${tag}-${name}`, name, bio: "Био." })
    .returning();
  instructorIds.push(i.id);
  return i;
}

async function makeSession(instructorId: number) {
  const [s] = await db
    .insert(classSessions)
    .values({
      sportId,
      instructorId,
      startTime: new Date(NOW.getTime() + 96 * HOUR),
      endTime: new Date(NOW.getTime() + 97 * HOUR),
      capacity: 10,
      priceCents: 1000,
    })
    .returning();
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
  return t;
}

const form = (entries: Record<string, string | number>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, String(v));
  return f;
};

const sessionForm = (instructorId: number) =>
  form({
    sportId,
    instructorId,
    date: "2031-08-05",
    startTime: "10:00",
    endTime: "11:00",
    capacity: 10,
    price: "10",
  });

const templateForm = (instructorId: number, o: { active?: boolean } = {}) =>
  form({
    sportId,
    instructorId,
    weekday: isoWeekday(NEXT_MONDAY_DATE),
    startTime: "10:00",
    durationMin: 60,
    capacity: 10,
    price: "10",
    ...(o.active === undefined ? {} : { active: o.active ? "on" : "" }),
  });

// Signs in with a fresh password after a link reset the credential; leaves a
// real row in "session" for the linked user.
async function freshCookie(email: string) {
  const [u] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email));
  await db
    .update(accountTable)
    .set({ password: await hashPassword("fresh-password-123456") })
    .where(eq(accountTable.userId, u.id));
  return signInCookie(email, "fresh-password-123456");
}

const instructorRow = async (id: number) =>
  (await db.select().from(instructors).where(eq(instructors.id, id)))[0];

const countSessions = async (instructorId: number) =>
  (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(classSessions)
      .where(eq(classSessions.instructorId, instructorId))
  )[0].n;

const templateRow = async (id: number) =>
  (await db.select().from(sessionTemplates).where(eq(sessionTemplates.id, id)))[0];

const roleOf = async (id: string) =>
  (await db.select({ r: userTable.role }).from(userTable).where(eq(userTable.id, id)))[0].r;

const connect = () => postgres(process.env.DATABASE_URL!, { max: 1 });
// The transaction handle the postgres-js `begin` callback receives.
type Tx = postgres.TransactionSql<Record<string, unknown>>;

// Resolves once a backend is queued waiting for `holderXid` to commit and
// returns that waiter's own transaction id, or null while it has none (a
// SELECT ... FOR UPDATE blocked on its first lock has not allocated an xid
// yet; a transaction that already updated rows — like the archive — has).
// `requireOwnXid` keeps polling until the waiter's own xid exists (used to
// chain a second waiter behind it). The 25 ms polls are condition-based; the
// deadline only turns a missing waiter into a test failure instead of a hang.
async function waitForWaiterOn(
  tx: Tx,
  holderXid: string,
  opts?: { timeoutMs?: number; requireOwnXid?: boolean }
): Promise<string | null> {
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows: { waiter_xid: string | null }[] = await tx`
      select (
        select own.transactionid::text as waiter_xid from pg_locks own
        where own.pid = w.pid and own.locktype = 'transactionid'
          and own.granted and own.mode = 'ExclusiveLock'
        limit 1
      ) as waiter_xid
      from pg_locks w
      where w.locktype = 'transactionid' and not w.granted
        and w.mode = 'ShareLock' and w.transactionid::text = ${holderXid}
      limit 1`;
    if (rows.length > 0 && (!opts?.requireOwnXid || rows[0].waiter_xid)) {
      return rows[0].waiter_xid;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  const diag = await tx`
    select locktype, transactionid::text as tx, mode, granted, pid
    from pg_locks where not granted limit 10`;
  const waiting = await tx`
    select pid, wait_event, state, left(query, 70) as q
    from pg_stat_activity where wait_event_type = 'Lock' limit 10`;
  throw new Error(
    `no backend waited on transaction ${holderXid} within ${timeoutMs}ms; ` +
      `not-granted locks: ${JSON.stringify(diag)}; lock waits: ${JSON.stringify(waiting)}`
  );
}

let adminCookie: string;
let E: Awaited<ReturnType<typeof makeInstructor>>; // active instructor, owns the reassigned session

beforeAll(async () => {
  const [sp] = await db.insert(sports).values({ slug: `${tag}-sp`, name: "T" }).returning();
  sportId = sp.id;
  adminCookie = (await makeUser("admin", "admin")).cookie;
  E = await makeInstructor("active-e");
});

afterAll(async () => {
  // Generated sessions are covered by the instructor_id filter.
  await db.delete(classSessions).where(inArray(classSessions.instructorId, [...instructorIds, E.id]));
  await db.delete(sessionTemplates).where(inArray(sessionTemplates.instructorId, [...instructorIds, E.id]));
  await db.delete(instructors).where(inArray(instructors.id, [...instructorIds, E.id]));
  if (sportId) await db.delete(sports).where(eq(sports.id, sportId));
  for (const e of userEmails) await deleteUser(e);
});

describe("archive races a dependent write (archive wins while the write waits on the lock)", () => {
  // A separate connection holds the instructor row lock, an archive-equivalent
  // UPDATE commits while the action is queued behind it, and the action must
  // refuse (READ COMMITTED re-checks the predicate on the latest committed
  // row version after the lock wait).
  async function archiveWhileWaiting(
    instructorId: number,
    startAction: () => Promise<unknown>
  ): Promise<unknown> {
    let caught: unknown;
    const c = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      let action: Promise<unknown> | undefined;
      await c.begin(async (tx) => {
        await tx`select id from instructors where id = ${instructorId} for update`;
        const [{ xid }] = await tx`select pg_current_xact_id()::text as xid`;
        action = startAction().then(
          () => {},
          (e) => {
            caught = e;
          }
        );
        await waitForWaiterOn(tx, xid);
        await tx`update instructors set archived_at = now() where id = ${instructorId}`;
        await tx`update session_templates set active = false where instructor_id = ${instructorId} and active`;
      });
      await action;
    } finally {
      await c.end();
    }
    return caught;
  }

  it("createSession refuses and inserts nothing", async () => {
    as(adminCookie);
    const X = await makeInstructor("m1");
    const caught = await archiveWhileWaiting(X.id, () => createSession(sessionForm(X.id)));
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/не е наличен/);
    expect(await countSessions(X.id)).toBe(0);
  }, 20000);

  it("updateSession reassignment to the instructor refuses and keeps the current instructor", async () => {
    as(adminCookie);
    const X = await makeInstructor("m2");
    const es = await makeSession(E.id);
    const caught = await archiveWhileWaiting(X.id, () =>
      updateSession(es.id, form({ sportId, instructorId: X.id, date: "2031-08-06", startTime: "10:00", endTime: "11:00", capacity: 10, price: "10" }))
    );
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/не е наличен/);
    const [sess] = await db.select().from(classSessions).where(eq(classSessions.id, es.id));
    expect(sess.instructorId).toBe(E.id);
  }, 20000);
});

describe("a REAL archive transaction races the dependent write (both block on the instructor lock)", () => {
  // The archive runs for real but is held mid-transaction (before commit) on
  // the DELETE of the linked user's sessions, which a separate connection
  // locked. The dependent action then queues on the instructor row the
  // archive already holds; releasing the first connection lets the archive
  // commit and the action must observe archived_at.
  async function realArchiveCommittingFirst(
    instructorId: number,
    linkedUserId: string,
    startAction: () => Promise<unknown>
  ): Promise<unknown> {
    let caught: unknown;
    const c = connect();
    let archive: Promise<unknown> | undefined;
    let action: Promise<unknown> | undefined;
    try {
      await c.begin(async (tx) => {
        await tx`select id from "session" where user_id = ${linkedUserId} for update`;
        const [{ xid }] = await tx`select pg_current_xact_id()::text as xid`;
        archive = archiveInstructorRow(instructorId).then(
          () => {},
          () => {}
        );
        // The archive already updated rows before blocking, so its own xid
        // exists once it is queued here.
        const archiveXid = (await waitForWaiterOn(tx, xid, {
          requireOwnXid: true,
        })) as string;
        action = startAction().then(
          () => {},
          (e) => {
            caught = e;
          }
        );
        await waitForWaiterOn(tx, archiveXid);
        // Returning commits this transaction and releases the session rows:
        // the archive finishes and commits, then the queued action wakes up on
        // the instructor row and must observe archived_at. Both are awaited
        // OUTSIDE — inside the callback they would wait for this commit.
      });
      await archive;
      await action;
    } finally {
      await c.end();
    }
    return caught;
  }

  async function linkedFixture(name: string) {
    const X = await makeInstructor(name);
    const u = await makeUser(`${name}-user`, "user");
    await linkInstructorAccount({ email: u.email, instructor: { id: X.id } });
    await freshCookie(u.email); // a live session row for the unlink to delete
    return { X, u };
  }

  it("createSession refuses; the archive completes atomically", async () => {
    const { X, u } = await linkedFixture("r1");
    const t = await makeTemplate(X.id);
    as(adminCookie);
    const caught = await realArchiveCommittingFirst(X.id, u.id, () =>
      createSession(sessionForm(X.id))
    );
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/не е наличен/);
    expect(await countSessions(X.id)).toBe(0);

    const row = await instructorRow(X.id);
    expect(row.archivedAt).not.toBeNull();
    expect(row.userId).toBeNull();
    expect((await templateRow(t.id)).active).toBe(false);
    expect(await roleOf(u.id)).toBe("user");
  }, 20000);

  it("generateSessions plans nothing and inserts nothing", async () => {
    const { X, u } = await linkedFixture("r2");
    const t = await makeTemplate(X.id);
    let result: Awaited<ReturnType<typeof generateSessions>> | undefined;
    const caught = await realArchiveCommittingFirst(X.id, u.id, () =>
      generateSessions({ templateIds: [t.id], now: NOW, weeks: 1 }).then((r) => {
        result = r;
      })
    );
    expect(caught).toBeUndefined();
    expect(result).toEqual({ created: 0, planned: 0 });
    expect(await countSessions(X.id)).toBe(0);
    expect((await instructorRow(X.id)).archivedAt).not.toBeNull();
  }, 20000);

  it("updateTemplate refuses to ACTIVATE the archived instructor's template even with an unchanged id", async () => {
    const { X, u } = await linkedFixture("r3");
    const t = await makeTemplate(X.id);
    as(adminCookie);
    const caught = await realArchiveCommittingFirst(X.id, u.id, () =>
      updateTemplate(t.id, templateForm(X.id, { active: true }))
    );
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/не е наличен/);
    expect((await templateRow(t.id)).active).toBe(false);
    expect((await instructorRow(X.id)).archivedAt).not.toBeNull();
  }, 20000);
});

describe("the dependent write commits first (archive preserves it)", () => {
  it("a session created before the archive stays; nothing can be inserted after it", async () => {
    as(adminCookie);
    const X = await makeInstructor("a1");
    const t = await makeTemplate(X.id);
    await createSession(sessionForm(X.id));
    expect(await countSessions(X.id)).toBe(1);

    const r = await archiveInstructorRow(X.id);
    expect(r.ok).toBe(true);
    expect(await countSessions(X.id)).toBe(1); // preserved

    await expect(createSession(sessionForm(X.id))).rejects.toThrow(/не е наличен/);
    expect(await countSessions(X.id)).toBe(1); // nothing inserted after the archive
    expect((await templateRow(t.id)).active).toBe(false);
  }, 20000);

  it("sessions generated before the archive stay; a rerun generates nothing", async () => {
    const X = await makeInstructor("a2");
    const t = await makeTemplate(X.id);
    const g1 = await generateSessions({ templateIds: [t.id], now: NOW, weeks: 1 });
    expect(g1.created).toBeGreaterThan(0);
    expect(await countSessions(X.id)).toBe(g1.created);

    const r = await archiveInstructorRow(X.id);
    expect(r.ok).toBe(true);
    expect(await countSessions(X.id)).toBe(g1.created); // classes preserved

    const g2 = await generateSessions({ templateIds: [t.id], now: NOW, weeks: 1 });
    expect(g2.created).toBe(0);
    expect(await countSessions(X.id)).toBe(g1.created); // no post-archive inserts
    expect((await templateRow(t.id)).active).toBe(false);
  }, 20000);
});

describe("link races archive", () => {
  it("either ordering ends identical: archived, unlinked, role back to user (no deadlock)", async () => {
    const X = await makeInstructor("l1");
    const u = await makeUser("l1-user", "user");
    const [linkR, archiveR] = await Promise.all([
      linkInstructorAccount({ email: u.email, instructor: { id: X.id } }),
      archiveInstructorRow(X.id),
    ]);
    // The link either won (and the archive then cut it) or saw an archived
    // instructor; both serialize on the instructor row and neither outcome
    // corrupts the final state.
    expect(linkR.ok || archiveR.ok).toBe(true);
    const row = await instructorRow(X.id);
    expect(row.archivedAt).not.toBeNull();
    expect(row.userId).toBeNull();
    expect(await roleOf(u.id)).toBe("user");
  }, 20000);
});
