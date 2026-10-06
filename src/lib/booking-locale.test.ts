import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  email: vi.fn(async () => {}),
}));
vi.mock("@/lib/email", () => ({
  sendBookingConfirmationEmail: mocks.email,
  sendBookingCancelledEmail: mocks.email,
  sendBookingReminderEmail: mocks.email,
  sendWaitlistSpotOpenEmail: mocks.email,
  sendVerificationEmail: vi.fn(async () => {}),
  sendPasswordResetEmail: vi.fn(async () => {}),
  sendExistingAccountEmail: vi.fn(async () => {}),
}));

import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports, waitlistEntries, user as userTable } from "@/db/schema";
import { cancelBookingAndNotify } from "@/lib/bookings";
import { notifyWaitlist } from "@/lib/waitlist";
import { POST as checkout } from "@/app/api/checkout/route";
import { GET as cron } from "@/app/api/cron/reminders/route";
import { deleteUser, makeVerifiedUser, signInCookie, signUpUser } from "@/lib/test-helpers";

const db = getDb();
const tag = `loc-${Date.now()}`;
let sportId: number;
let sportSlug: string;
let instructorId: number;
const sessionIds: number[] = [];
const userEmails: string[] = [];
const bookingIds: number[] = [];
const waitlistIds: number[] = [];

async function makeSession(opts: { startsInMs?: number; capacity?: number; bookedCount?: number } = {}) {
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

function req(body: unknown, cookie?: string, extraHeaders?: Record<string, string>) {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { ...(cookie ? { cookie } : {}), ...extraHeaders },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const [sport] = await db
    .insert(sports)
    .values({ slug: `${tag}-s`, name: "T" })
    .returning();
  sportId = sport.id;
  sportSlug = sport.slug;
  const [ins] = await db.insert(instructors).values({ slug: `${tag}-i`, name: "T" }).returning();
  instructorId = ins.id;
});

afterAll(async () => {
  if (waitlistIds.length) await db.delete(waitlistEntries).where(inArray(waitlistEntries.id, waitlistIds));
  if (bookingIds.length) await db.delete(bookings).where(inArray(bookings.id, bookingIds));
  if (sessionIds.length) {
    await db.delete(bookings).where(inArray(bookings.sessionId, sessionIds));
    await db.delete(waitlistEntries).where(inArray(waitlistEntries.sessionId, sessionIds));
    await db.delete(classSessions).where(inArray(classSessions.id, sessionIds));
  }
  await db.delete(instructors).where(eq(instructors.id, instructorId));
  await db.delete(sports).where(eq(sports.id, sportId));
  for (const email of userEmails) await deleteUser(email);
});

beforeEach(() => {
  mocks.email.mockClear();
});

describe("checkout early errors use the page locale (x-app-locale)", () => {
  it("a guest 401 on a fresh /en page (no cookie at all) is in English", async () => {
    const res = await checkout(req({ sessionId: 1, phone: "0888123456" }, undefined, { "x-app-locale": "en" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized.");
  });

  it("a guest 401 without any signal stays Bulgarian", async () => {
    const res = await checkout(req({ sessionId: 1, phone: "0888123456" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Неоторизиран достъп.");
  });

  it("a stale NEXT_LOCALE=bg cookie must not turn an /en page's 401 Bulgarian", async () => {
    const res = await checkout(req({ sessionId: 1, phone: "0888123456" }, "NEXT_LOCALE=bg", { "x-app-locale": "en" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized.");
  });

  it("the unverified-email 403 (before the body is read) follows the page locale too", async () => {
    const email = `${tag}-uv-en@test.local`;
    userEmails.push(email);
    const user = await signUpUser({ email });
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
    const cookie = await signInCookie(email);
    await db.update(userTable).set({ emailVerified: false }).where(eq(userTable.id, user.id));

    const res = await checkout(req({ sessionId: 1, phone: "0888123456" }, cookie, { "x-app-locale": "en" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("Confirm your email");
  });
});

describe("checkout stores the booking locale", () => {
  it("persists locale 'en' from the body and sends the confirmation letter in en", async () => {
    const s = await makeSession();
    userEmails.push(`${tag}-en@test.local`);
    const cookie = await makeVerifiedUser(`${tag}-en`);
    const res = await checkout(req({ sessionId: s.id, phone: "0888123456", locale: "en" }, cookie));
    expect(res.status).toBe(200);
    const data = await res.json();
    bookingIds.push(data.bookingId);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, data.bookingId));
    expect(b.locale).toBe("en");
    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect((mocks.email.mock.calls[0] as unknown as [{ locale: string }])[0].locale).toBe("en");
  });

  it("a junk locale falls back to bg", async () => {
    const s = await makeSession();
    userEmails.push(`${tag}-xx@test.local`);
    const cookie = await makeVerifiedUser(`${tag}-xx`);
    const res = await checkout(req({ sessionId: s.id, phone: "0888123456", locale: "de" }, cookie));
    expect(res.status).toBe(200);
    const data = await res.json();
    bookingIds.push(data.bookingId);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, data.bookingId));
    expect(b.locale).toBe("bg");
    expect((mocks.email.mock.calls[0] as unknown as [{ locale: string }])[0].locale).toBe("bg");
  });

  it("without a body locale the NEXT_LOCALE cookie decides (en), else bg", async () => {
    const s = await makeSession();
    userEmails.push(`${tag}-ck@test.local`);
    const cookie = await makeVerifiedUser(`${tag}-ck`);
    const res = await checkout(req({ sessionId: s.id, phone: "0888123456" }, `${cookie}; NEXT_LOCALE=en`));
    expect(res.status).toBe(200);
    const data = await res.json();
    bookingIds.push(data.bookingId);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, data.bookingId));
    expect(b.locale).toBe("en");

    const s2 = await makeSession();
    userEmails.push(`${tag}-nck@test.local`);
    const cookie2 = await makeVerifiedUser(`${tag}-nck`);
    const res2 = await checkout(req({ sessionId: s2.id, phone: "0888123456" }, cookie2));
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    bookingIds.push(data2.bookingId);
    const [b2] = await db.select().from(bookings).where(eq(bookings.id, data2.bookingId));
    expect(b2.locale).toBe("bg");
  });

  it("the localized error path answers in the requested language (invalid phone, en)", async () => {
    const s = await makeSession();
    userEmails.push(`${tag}-err@test.local`);
    const cookie = await makeVerifiedUser(`${tag}-err`);
    const res = await checkout(req({ sessionId: s.id, phone: "+0912345678", locale: "en" }, cookie));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe(
      "Invalid phone number. Enter a Bulgarian (08… or +359…) or an international one (+country code…)."
    );
  });
});

describe("old rows keep working after the migration (default bg)", () => {
  it("a raw insert without locale (pre-migration shape) reads back as bg", async () => {
    const s = await makeSession();
    const email = `${tag}-raw@test.local`;
    await db.execute(sql`
      insert into bookings (session_id, user_id, user_email, user_phone, status, payment_method)
      values (${s.id}, ${`${tag}-raw`}, ${email}, '+359888123456', 'pending', 'cash')
      returning id
    `);
    const [b] = await db.select().from(bookings).where(eq(bookings.userId, `${tag}-raw`));
    expect(b.locale).toBe("bg");
    bookingIds.push(b.id);

    const [w] = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.userId, `${tag}-raw`));
    expect(w).toBeUndefined();
    await db.execute(sql`
      insert into waitlist_entries (session_id, user_id, user_email)
      values (${s.id}, ${`${tag}-raw`}, ${email})
    `);
    const [w2] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.userId, `${tag}-raw`));
    expect(w2.locale).toBe("bg");
    waitlistIds.push(w2.id);
  });
});

describe("cron reminders use the stored booking locale, never the request cookie", () => {
  const OLD = process.env.CRON_SECRET;
  afterAll(() => {
    process.env.CRON_SECRET = OLD;
  });

  it("sends each reminder in the locale saved at booking time", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    const s = await makeSession({ startsInMs: 3600000, bookedCount: 2 });

    const bgEmail = `${tag}-rem-bg@test.local`;
    const enEmail = `${tag}-rem-en@test.local`;
    await db.insert(bookings).values([
      {
        sessionId: s.id,
        userId: `${tag}-rem-bg`,
        userEmail: bgEmail,
        userPhone: "+359888123456",
        paymentMethod: "cash",
        locale: "bg",
      },
      {
        sessionId: s.id,
        userId: `${tag}-rem-en`,
        userEmail: enEmail,
        userPhone: "+359888123456",
        paymentMethod: "cash",
        locale: "en",
      },
    ]);

    // The cron request carries NO cookies at all — only the auth header.
    const res = await cron(
      new Request("http://localhost/api/cron/reminders", {
        headers: { authorization: "Bearer test-secret-value" },
      })
    );
    expect(res.status).toBe(200);

    const calls = mocks.email.mock.calls as unknown as [{ to: string; locale: string }][];
    const toBg = calls.filter((c) => c[0].to === bgEmail);
    const toEn = calls.filter((c) => c[0].to === enEmail);
    expect(toBg).toHaveLength(1);
    expect(toBg[0][0].locale).toBe("bg");
    expect(toEn).toHaveLength(1);
    expect(toEn[0][0].locale).toBe("en");

    // Cleanup these two fixtures via their own rows.
    const rows = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.sessionId, s.id));
    bookingIds.push(...rows.map((r) => r.id));
  });
});

describe("cancellation uses the stored booking locale", () => {
  it("sends the cancelled letter in the locale saved at booking time", async () => {
    const s = await makeSession({ bookedCount: 1 });
    const [b] = await db
      .insert(bookings)
      .values({
        sessionId: s.id,
        userId: `${tag}-cancel`,
        userEmail: `${tag}-cancel@test.local`,
        userPhone: "+359888123456",
        paymentMethod: "cash",
        locale: "en",
      })
      .returning();
    bookingIds.push(b.id);

    await cancelBookingAndNotify(b.id, "booking");

    expect(mocks.email).toHaveBeenCalledTimes(1);
    const call = mocks.email.mock.calls[0] as unknown as [
      { to: string; locale: string; reason: string },
    ];
    expect(call[0].to).toBe(`${tag}-cancel@test.local`);
    expect(call[0].locale).toBe("en");
    expect(call[0].reason).toBe("booking");
  });
});

describe("waitlist availability notices use each entry's stored locale", () => {
  it("notifies bg and en waiters in their own languages with localized links", async () => {
    const s = await makeSession({ capacity: 1, bookedCount: 0 });

    const bgEmail = `${tag}-wl-bg@test.local`;
    const enEmail = `${tag}-wl-en@test.local`;
    const rows = await db
      .insert(waitlistEntries)
      .values([
        { sessionId: s.id, userId: `${tag}-wl-bg`, userEmail: bgEmail, locale: "bg" },
        { sessionId: s.id, userId: `${tag}-wl-en`, userEmail: enEmail, locale: "en" },
      ])
      .returning({ id: waitlistEntries.id });
    waitlistIds.push(...rows.map((r) => r.id));

    await notifyWaitlist(s.id);

    expect(mocks.email).toHaveBeenCalledTimes(2);
    const calls = mocks.email.mock.calls as unknown as [{ to: string; locale: string; bookUrl: string }][];
    const bgCall = calls.find((c) => c[0].to === bgEmail)![0];
    const enCall = calls.find((c) => c[0].to === enEmail)![0];
    expect(bgCall.locale).toBe("bg");
    expect(bgCall.bookUrl).not.toContain("/en");
    expect(bgCall.bookUrl.endsWith(`/sports/${sportSlug}`)).toBe(true);
    expect(enCall.locale).toBe("en");
    expect(enCall.bookUrl).toBe(
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/en/sports/${sportSlug}`
    );
  });
});
