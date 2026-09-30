import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  email: vi.fn(async () => {}),
  sms: vi.fn(async () => {}),
}));

vi.mock("@clerk/nextjs/server", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/email", () => ({
  sendBookingConfirmationEmail: mocks.email,
  sendBookingCancelledEmail: mocks.email,
  sendBookingReminderEmail: mocks.email,
  sendWaitlistSpotOpenEmail: mocks.email,
}));
vi.mock("@/lib/sms", () => ({
  sendBookingConfirmationSms: mocks.sms,
  sendBookingCancelledSms: mocks.sms,
  sendBookingReminderSms: mocks.sms,
}));

import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports } from "@/db/schema";
import { cancelBookingAndNotify } from "@/lib/bookings";
import { POST as checkout } from "@/app/api/checkout/route";
import { GET as cron } from "@/app/api/cron/reminders/route";

const db = getDb();
const tag = `hardening-${Date.now()}`;
let sportId: number;
let instructorId: number;
const sessionIds: number[] = [];

async function makeSession(opts: { capacity?: number; bookedCount?: number; startsInMs?: number }) {
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

function req(body: unknown) {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function loginAs(id: string, email = `${id}@example.com`) {
  mocks.currentUser.mockResolvedValue({ id, primaryEmailAddress: { emailAddress: email } });
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
});

beforeEach(() => {
  mocks.email.mockClear();
  mocks.sms.mockClear();
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
    expect(mocks.sms).toHaveBeenCalledTimes(1);
  });
});

describe("checkout", () => {
  it("does not leak a spot when the booking insert fails", async () => {
    const s = await makeSession({ capacity: 3, bookedCount: 0 });
    // Over-long email makes the INSERT fail after the spot was claimed.
    loginAs(`${tag}-leak`, `${"x".repeat(300)}@example.com`);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      checkout(req({ sessionId: s.id, phone: "0888123456", paymentMethod: "cash" }))
    ).rejects.toThrow();
    spy.mockRestore();
    expect(await spots(s.id)).toBe(0);
  });

  it("books once, normalizes the phone, then answers 409 for a duplicate", async () => {
    const s = await makeSession({});
    loginAs(`${tag}-dup`);
    const ok = await checkout(req({ sessionId: s.id, phone: "0888 123 456", paymentMethod: "cash" }));
    expect(ok.status).toBe(200);
    const [b] = await db.select().from(bookings).where(eq(bookings.sessionId, s.id));
    expect(b.userPhone).toBe("+359888123456");

    const dup = await checkout(req({ sessionId: s.id, phone: "0888123456", paymentMethod: "cash" }));
    expect(dup.status).toBe(409);
    expect(await spots(s.id)).toBe(1);
  });

  it("rejects a bad phone before claiming a spot", async () => {
    const s = await makeSession({});
    loginAs(`${tag}-ph`);
    const res = await checkout(req({ sessionId: s.id, phone: "+4915112345678", paymentMethod: "cash" }));
    expect(res.status).toBe(400);
    expect(await spots(s.id)).toBe(0);
  });

  it("rejects sessions in the past", async () => {
    const s = await makeSession({ startsInMs: -60000 });
    loginAs(`${tag}-past`);
    const res = await checkout(req({ sessionId: s.id, phone: "0888123456", paymentMethod: "cash" }));
    expect(res.status).toBe(400);
    expect(await spots(s.id)).toBe(0);
  });

  it("rate-limits to 5 bookings per user per hour", async () => {
    loginAs(`${tag}-rl`);
    for (let i = 0; i < 5; i++) {
      const s = await makeSession({});
      const res = await checkout(req({ sessionId: s.id, phone: "0888123456", paymentMethod: "cash" }));
      expect(res.status).toBe(200);
    }
    const s = await makeSession({});
    const res = await checkout(req({ sessionId: s.id, phone: "0888123456", paymentMethod: "cash" }));
    expect(res.status).toBe(429);
    expect(await spots(s.id)).toBe(0);
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
