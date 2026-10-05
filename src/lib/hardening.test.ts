import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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

import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports } from "@/db/schema";
import { cancelBookingAndNotify } from "@/lib/bookings";
import { POST as checkout } from "@/app/api/checkout/route";
import { GET as cron } from "@/app/api/cron/reminders/route";
import {
  deleteUser,
  makeVerifiedUser,
  signInCookie,
  signUpUser,
  verifyUserEmail,
} from "@/lib/test-helpers";

const db = getDb();
const tag = `hardening-${Date.now()}`;
let sportId: number;
let instructorId: number;
const sessionIds: number[] = [];
const userEmails: string[] = [];

async function makeSession(opts: {
  capacity?: number;
  bookedCount?: number;
  startsInMs?: number;
}) {
  const start = Date.now() + (opts.startsInMs ?? 86400000);
  const [s] = await db
    .insert(classSessions)
    .values({
      sportId,
      instructorId,
      startTime: new Date(start),
      endTime: new Date(start + 3600000),
      capacity: opts.capacity ?? 5,
      bookedCount: opts.bookedCount ?? 0,
      priceCents: 600,
    })
    .returning();
  sessionIds.push(s.id);
  return s;
}

async function spots(sessionId: number) {
  const [s] = await db
    .select({ n: classSessions.bookedCount })
    .from(classSessions)
    .where(eq(classSessions.id, sessionId));
  return s.n;
}

function req(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
    body: JSON.stringify(body),
  });
}

// Registers a verified user with a custom email (for the column-overflow test).
async function cookieForEmail(tagPart: string, email: string) {
  userEmails.push(email);
  await signUpUser({ email, name: "L" });
  await verifyUserEmail(email);
  return signInCookie(email);
}

beforeAll(async () => {
  const [sport] = await db.insert(sports).values({ slug: `${tag}-s`, name: "T" }).returning();
  sportId = sport.id;
  const [ins] = await db.insert(instructors).values({ slug: `${tag}-i`, name: "T" }).returning();
  instructorId = ins.id;
});

afterAll(async () => {
  if (sessionIds.length) {
    await db.delete(bookings).where(inArray(bookings.sessionId, sessionIds));
    await db.delete(classSessions).where(inArray(classSessions.id, sessionIds));
  }
  await db.delete(instructors).where(eq(instructors.id, instructorId));
  await db.delete(sports).where(eq(sports.id, sportId));
  for (const email of userEmails) await deleteUser(email);
});

beforeEach(() => {
  mocks.email.mockClear();
  mocks.verification.mockClear();
  mocks.reset.mockClear();
});

describe("cancel is atomic", () => {
  it("double (concurrent) cancel releases exactly one spot and notifies once", async () => {
    const s = await makeSession({ bookedCount: 2 });
    const [b] = await db
      .insert(bookings)
      .values({
        sessionId: s.id,
        userId: `${tag}-c`,
        userEmail: "c@example.com",
        userPhone: "+359888123456",
        paymentMethod: "cash",
      })
      .returning();

    await Promise.all([
      cancelBookingAndNotify(b.id),
      cancelBookingAndNotify(b.id),
      cancelBookingAndNotify(b.id),
    ]);

    expect(await spots(s.id)).toBe(1);
    expect(mocks.email).toHaveBeenCalledTimes(1);
  });
});

describe("checkout", () => {
  it("does not leak a spot when the booking insert fails", async () => {
    const s = await makeSession({ capacity: 3, bookedCount: 0 });
    // A 260-char email passes sign-up (the auth table stores text) but overflows
    // bookings.user_email (varchar 256): the INSERT fails after the spot was claimed.
    const email = `${"x".repeat(248)}@example.com`;
    const cookie = await cookieForEmail(`${tag}-leak`, email);

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      checkout(req({ sessionId: s.id, phone: "0888123456" }, cookie))
    ).rejects.toThrow();
    spy.mockRestore();
    expect(await spots(s.id)).toBe(0);
  });

  it("books once, normalizes the phone, then answers 409 for a duplicate", async () => {
    const s = await makeSession({});
    const email = `${tag}-dup@test.local`;
    userEmails.push(email);
    const cookie = await makeVerifiedUser(`${tag}-dup`);
    const ok = await checkout(req({ sessionId: s.id, phone: "0888 123 456" }, cookie));
    expect(ok.status).toBe(200);
    const [b] = await db.select().from(bookings).where(eq(bookings.sessionId, s.id));
    expect(b.userPhone).toBe("+359888123456");
    expect(b.userEmail).toBe(email);

    const dup = await checkout(req({ sessionId: s.id, phone: "0888123456" }, cookie));
    expect(dup.status).toBe(409);
    expect(await spots(s.id)).toBe(1);
  });

  it("rejects a bad phone before claiming a spot", async () => {
    const s = await makeSession({});
    userEmails.push(`${tag}-ph@test.local`);
    const cookie = await makeVerifiedUser(`${tag}-ph`);
    const res = await checkout(
      req({ sessionId: s.id, phone: "+0912345678" }, cookie)
    );
    expect(res.status).toBe(400);
    expect(await spots(s.id)).toBe(0);
  });

  it("rejects sessions in the past", async () => {
    const s = await makeSession({ startsInMs: -60000 });
    userEmails.push(`${tag}-past@test.local`);
    const cookie = await makeVerifiedUser(`${tag}-past`);
    const res = await checkout(req({ sessionId: s.id, phone: "0888123456" }, cookie));
    expect(res.status).toBe(400);
    expect(await spots(s.id)).toBe(0);
  });

  it("requires a session (401 without cookies)", async () => {
    const s = await makeSession({});
    const res = await checkout(req({ sessionId: s.id, phone: "0888123456" }));
    expect(res.status).toBe(401);
    expect(await spots(s.id)).toBe(0);
  });

  it("rate-limits to 5 bookings per user per hour", async () => {
    userEmails.push(`${tag}-rl@test.local`);
    const cookie = await makeVerifiedUser(`${tag}-rl`);
    for (let i = 0; i < 5; i++) {
      const s = await makeSession({});
      const res = await checkout(req({ sessionId: s.id, phone: "0888123456" }, cookie));
      expect(res.status).toBe(200);
    }
    const s = await makeSession({});
    const res = await checkout(req({ sessionId: s.id, phone: "0888123456" }, cookie));
    expect(res.status).toBe(429);
    expect(await spots(s.id)).toBe(0);
  });

  it("the strict rate limit holds under parallel requests (no 6th booking)", async () => {
    const email = `${tag}-par@test.local`;
    userEmails.push(email);
    const cookie = await makeVerifiedUser(`${tag}-par`);
    const sessions = await Promise.all(Array.from({ length: 6 }, () => makeSession({})));

    const results = await Promise.all(
      sessions.map((s) =>
        checkout(req({ sessionId: s.id, phone: "0888123456" }, cookie)).then(
          (r) => r.status
        )
      )
    );

    expect(results.filter((code) => code === 200)).toHaveLength(5);
    expect(results.filter((code) => code === 429)).toHaveLength(1);
    // Exactly five spots claimed in total, no leaks.
    const total = await Promise.all(sessions.map((s) => spots(s.id)));
    expect(total.reduce((a, b) => a + b, 0)).toBe(5);
  });
});

describe("cron reminders", () => {
  const OLD = process.env.CRON_SECRET;
  afterAll(() => {
    process.env.CRON_SECRET = OLD;
  });

  function cronReq(auth?: string) {
    return new Request("http://localhost/api/cron/reminders", {
      headers: auth ? { authorization: auth } : {},
    });
  }

  it("fails closed when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    const res = await cron(cronReq("Bearer undefined"));
    expect(res.status).toBe(500);
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret and claims each reminder only once", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    expect((await cron(cronReq("Bearer nope"))).status).toBe(401);
    expect((await cron(cronReq())).status).toBe(401);

    const s = await makeSession({ bookedCount: 1, startsInMs: 3600000 });
    await db.insert(bookings).values({
      sessionId: s.id,
      userId: `${tag}-cron`,
      userEmail: "cron@example.com",
      userPhone: "+359888123456",
      paymentMethod: "cash",
    });

    const results = await Promise.all([
      cron(cronReq("Bearer test-secret-value")),
      cron(cronReq("Bearer test-secret-value")),
    ]);
    results.forEach((r) => expect(r.status).toBe(200));
    // Other pending bookings in the DB may also be due, so look at this booking's own mail.
    const toCron = mocks.email.mock.calls.filter(
      (c) => (c as unknown as [{ to: string }])[0].to === "cron@example.com"
    );
    expect(toCron).toHaveLength(1);
  });
});
