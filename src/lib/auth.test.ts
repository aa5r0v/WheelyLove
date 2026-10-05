import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";

// Auth emails must never be sent; we capture the verification/reset payloads instead.
const mocks = vi.hoisted(() => ({
  email: vi.fn(async () => {}),
  verification: vi.fn(async () => {}),
  reset: vi.fn(async () => {}),
}));

vi.mock("@/lib/email", () => ({
  sendBookingConfirmationEmail: mocks.email,
  sendBookingCancelledEmail: mocks.email,
  sendBookingReminderEmail: mocks.email,
  sendWaitlistSpotOpenEmail: mocks.email,
  sendVerificationEmail: mocks.verification,
  sendPasswordResetEmail: mocks.reset,
}));

// The admin actions resolve the session through next/headers.
const headerState = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => headerState.headers,
}));
// Admin actions revalidate paths; outside a Next render that would throw.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDb } from "@/db";
import {
  bookings,
  classSessions,
  instructors,
  sports,
  user as userTable,
} from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { POST as checkout } from "@/app/api/checkout/route";
import { confirmCashBooking } from "@/app/admin/actions";
import {
  DEFAULT_PASSWORD,
  deleteUser,
  signInCookie,
  signUpUser,
} from "@/lib/test-helpers";

const tag = `auth-${Date.now()}`;
const db = getDb();
let sessionId: number;
let sportId: number;
let instructorId: number;
const createdUserEmails: string[] = [];

function req(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const [sport] = await db
    .insert(sports)
    .values({ slug: `${tag}-s`, name: "T" })
    .returning();
  sportId = sport.id;
  const [ins] = await db.insert(instructors).values({ slug: `${tag}-i`, name: "T" }).returning();
  instructorId = ins.id;
  const start = Date.now() + 86400000;
  const [s] = await db
    .insert(classSessions)
    .values({
      sportId,
      instructorId,
      startTime: new Date(start),
      endTime: new Date(start + 3600000),
      capacity: 5,
      priceCents: 600,
    })
    .returning();
  sessionId = s.id;
});

afterAll(async () => {
  await db.delete(bookings).where(eq(bookings.sessionId, sessionId));
  await db.delete(classSessions).where(eq(classSessions.id, sessionId));
  await db.delete(instructors).where(eq(instructors.id, instructorId));
  await db.delete(sports).where(eq(sports.id, sportId));
  for (const email of createdUserEmails) await deleteUser(email);
});

describe("email verification gates booking", () => {
  it("sign-up leaves the email unverified and blocks booking with 403", async () => {
    const email = `${tag}-a@test.local`;
    createdUserEmails.push(email);
    const user = await signUpUser({ email });

    expect(user.emailVerified).toBe(false);
    expect(mocks.verification).toHaveBeenCalledTimes(1);

    const cookie = await signInCookie(email);
    const res = await checkout(
      req({ sessionId, phone: "0888123456" }, cookie)
    );
    expect(res.status).toBe(403);
    const [none] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.userId, user.id));
    expect(none).toBeUndefined();
  });

  it("a verified user can book", async () => {
    const email = `${tag}-b@test.local`;
    createdUserEmails.push(email);
    const user = await signUpUser({ email });
    await db
      .update(userTable)
      .set({ emailVerified: true })
      .where(eq(userTable.id, user.id));

    const cookie = await signInCookie(email);
    const res = await checkout(req({ sessionId, phone: "0888123456" }, cookie));
    expect(res.status).toBe(200);

    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.userId, user.id));
    expect(booking).toMatchObject({
      userId: user.id,
      userEmail: email,
      paymentMethod: "cash",
      status: "pending",
    });
  });
});

describe("password reset", () => {
  const email = `${tag}-reset@test.local`;
  const newPassword = "new-password-654321";

  beforeAll(async () => {
    createdUserEmails.push(email);
    await signUpUser({ email });
  });

  it("does not reveal whether the email exists", async () => {
    const auth = getAuth();
    // Both an existing and a missing address answer the same way.
    for (const addr of [email, `${tag}-missing@test.local`]) {
      const res = await auth.api.requestPasswordReset({
        body: { email: addr, redirectTo: "/reset-password" },
        headers: new Headers(),
      });
      expect(res.status).toBe(true);
    }
    // Only the existing address got an email (with a one-time token URL).
    expect(mocks.reset).toHaveBeenCalledTimes(1);
  });

  it("the token works exactly once and revokes the old password", async () => {
    const auth = getAuth();
    const url = (mocks.reset.mock.calls[0] as unknown as [{ url: string }])[0].url;
    const token = new URL(url).pathname.split("/").pop()!;
    expect(token).toBeTruthy();

    await auth.api.resetPassword({
      body: { newPassword, token },
      headers: new Headers(),
    });

    // Old password no longer signs in, the new one does.
    await expect(
      auth.api.signInEmail({
        body: { email, password: DEFAULT_PASSWORD },
        headers: new Headers(),
      })
    ).rejects.toThrow();
    const signedIn = await auth.api.signInEmail({
      body: { email, password: newPassword },
      headers: new Headers(),
    });
    expect(signedIn.user.email).toBe(email);

    // The token is consumed: a second reset with it must fail.
    await expect(
      auth.api.resetPassword({
        body: { newPassword: "another-password-987", token },
        headers: new Headers(),
      })
    ).rejects.toThrow();
  });
});

describe("admin role", () => {
  it("a non-admin is rejected by assertAdmin", async () => {
    const email = `${tag}-user@test.local`;
    createdUserEmails.push(email);
    await signUpUser({ email });
    const cookie = await signInCookie(email);
    headerState.headers.set("cookie", cookie);

    await expect(confirmCashBooking(999999)).rejects.toThrow(
      "Нямаш права за администратор."
    );
  });

  it("an admin (role set in the user table) passes", async () => {
    const email = `${tag}-admin@test.local`;
    createdUserEmails.push(email);
    await signUpUser({ email });
    await db.update(userTable).set({ role: "admin" }).where(eq(userTable.email, email));
    const cookie = await signInCookie(email);
    headerState.headers.set("cookie", cookie);

    // No booking with id 999999 exists: nothing happens, but no rejection either.
    await expect(confirmCashBooking(999999)).resolves.toBeUndefined();
  });
});
