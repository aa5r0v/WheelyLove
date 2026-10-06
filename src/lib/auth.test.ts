import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";

// Auth emails must never be sent; we capture the verification/reset payloads instead.
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
  rateLimit,
  sports,
  session as sessionTable,
  user as userTable,
} from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { POST as checkout } from "@/app/api/checkout/route";
import { POST as authPost } from "@/app/api/auth/[...all]/route";
import { confirmCashBooking } from "@/app/[locale]/admin/actions";
import {
  DEFAULT_PASSWORD,
  deleteUser,
  signInCookie,
  signUpUser,
  verifyUserEmail,
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

describe("email verification gates the account", () => {
  it("an unverified user cannot sign in and gets a fresh link instead", async () => {
    const email = `${tag}-uv@test.local`;
    createdUserEmails.push(email);
    const user = await signUpUser({ email });

    expect(user.emailVerified).toBe(false);
    // sendOnSignUp dispatched the first verification email...
    expect(mocks.verification).toHaveBeenCalledTimes(1);

    // ...and sign-up created no session (no auto sign-in while unverified).
    const sessions = await db
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(eq(sessionTable.userId, user.id));
    expect(sessions).toHaveLength(0);

    // The blocked sign-in attempt: 403 EMAIL_NOT_VERIFIED, no cookie.
    await expect(
      getAuth().api.signInEmail({
        body: { email, password: DEFAULT_PASSWORD },
        headers: new Headers(),
      })
    ).rejects.toMatchObject({ statusCode: 403, body: { code: "EMAIL_NOT_VERIFIED" } });

    // sendOnSignIn dispatched a NEW link together with the rejection.
    expect(mocks.verification).toHaveBeenCalledTimes(2);

    // The fresh link lives 24 hours (expiresIn: 86400), like the email says.
    const url = (mocks.verification.mock.calls.at(-1) as unknown as [{ url: string }])[0]
      .url;
    const token = new URL(url).searchParams.get("token")!;
    expect(token).toBeTruthy();
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64url").toString()
    );
    expect(payload.exp - payload.iat).toBe(86400);
  });

  it("the booking endpoint still refuses a session whose email is unverified (403)", async () => {
    // With requireEmailVerification an unverified user cannot obtain a session
    // anymore; this exercises the app-level gate independently of that: the
    // session is created while verified, then verification is flipped off.
    const email = `${tag}-gate@test.local`;
    createdUserEmails.push(email);
    const user = await signUpUser({ email });
    await db
      .update(userTable)
      .set({ emailVerified: true })
      .where(eq(userTable.id, user.id));

    const cookie = await signInCookie(email);
    await db
      .update(userTable)
      .set({ emailVerified: false })
      .where(eq(userTable.id, user.id));

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

describe("sign-up does not reveal existing emails", () => {
  function signUpReq(email: string) {
    return new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T", email, password: DEFAULT_PASSWORD }),
    });
  }

  it("answers with the same status and body shape for a new and a taken address", async () => {
    const taken = `${tag}-taken@test.local`;
    const fresh = `${tag}-fresh@test.local`;
    createdUserEmails.push(taken, fresh);
    await signUpUser({ email: taken });

    await db.delete(rateLimit); // keep the sign-up rate limiter out of the way
    const resFresh = await authPost(signUpReq(fresh));
    const bodyFresh = await resFresh.json();

    await db.delete(rateLimit);
    const resTaken = await authPost(signUpReq(taken));
    const bodyTaken = await resTaken.json();

    expect(resTaken.status).toBe(resFresh.status);
    // Identical client-visible shape: no session token either way, same user
    // fields. Only id / timestamps / the address itself may differ.
    expect(bodyFresh.token).toBeNull();
    expect(bodyTaken.token).toBeNull();
    expect(Object.keys(bodyTaken).sort()).toEqual(Object.keys(bodyFresh).sort());
    expect(Object.keys(bodyTaken.user).sort()).toEqual(
      Object.keys(bodyFresh.user).sort()
    );
    for (const key of Object.keys(bodyTaken.user)) {
      if (["id", "createdAt", "updatedAt", "email", "name"].includes(key)) continue;
      expect(bodyTaken.user[key]).toEqual(bodyFresh.user[key]);
    }
  });

  it("notifies the owner when someone signs up with their taken address; a fresh address is not notified", async () => {
    const taken = `${tag}-taken2@test.local`;
    const fresh = `${tag}-fresh2@test.local`;
    createdUserEmails.push(taken, fresh);
    await signUpUser({ email: taken });
    mocks.existing.mockClear();

    await db.delete(rateLimit); // keep the sign-up rate limiter out of the way
    const res = await authPost(signUpReq(taken));
    expect(res.status).toBe(200);
    expect(mocks.existing).toHaveBeenCalledTimes(1);
    expect((mocks.existing.mock.calls[0] as unknown as [{ to: string }])[0].to).toBe(taken);

    await db.delete(rateLimit);
    await authPost(signUpReq(fresh));
    // No second letter: the fresh address got the normal verification email only.
    expect(mocks.existing).toHaveBeenCalledTimes(1);
  });
});

describe("auth email language follows the page (x-app-locale header)", () => {
  function authReq(path: string, body: unknown, headers: Record<string, string> = {}) {
    return new Request(`http://localhost/api/auth/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("a fresh /en sign-up without any cookie sends the English verification letter", async () => {
    const email = `${tag}-ensu@test.local`;
    createdUserEmails.push(email);
    mocks.verification.mockClear();
    await db.delete(rateLimit);

    const res = await authPost(
      authReq("sign-up/email", { name: "EN", email, password: DEFAULT_PASSWORD }, { "x-app-locale": "en" })
    );
    expect(res.status).toBe(200);
    expect(mocks.verification).toHaveBeenCalledTimes(1);
    const call = mocks.verification.mock.calls[0] as unknown as [{ locale?: string }];
    expect(call[0].locale).toBe("en");
  });

  it("a stale en cookie on a Bulgarian page must not switch the letter to English", async () => {
    const email = `${tag}-bgsu@test.local`;
    createdUserEmails.push(email);
    mocks.verification.mockClear();
    await db.delete(rateLimit);

    await authPost(
      authReq("sign-up/email", { name: "BG", email, password: DEFAULT_PASSWORD }, {
        "x-app-locale": "bg",
        cookie: "NEXT_LOCALE=en",
      })
    );
    const call = mocks.verification.mock.calls.at(-1) as unknown as [{ locale?: string }];
    expect(call[0].locale).toBe("bg");
  });

  it("a fresh /en forgot-password without any cookie sends the English reset letter", async () => {
    const email = `${tag}-enreset@test.local`;
    createdUserEmails.push(email);
    const user = await signUpUser({ email });
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
    mocks.reset.mockClear();

    await authPost(
      authReq("request-password-reset", { email, redirectTo: "/en/reset-password" }, { "x-app-locale": "en" })
    );
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    const call = mocks.reset.mock.calls[0] as unknown as [{ locale?: string }];
    expect(call[0].locale).toBe("en");
  });

  it("the existing-account warning follows the page language too", async () => {
    const taken = `${tag}-taken3@test.local`;
    createdUserEmails.push(taken);
    await signUpUser({ email: taken });
    mocks.existing.mockClear();
    await db.delete(rateLimit);

    await authPost(
      authReq("sign-up/email", { name: "EN", email: taken, password: DEFAULT_PASSWORD }, { "x-app-locale": "en" })
    );
    const call = mocks.existing.mock.calls.at(-1) as unknown as [{ locale?: string }];
    expect(call[0].locale).toBe("en");
  });
});

describe("password reset", () => {
  const email = `${tag}-reset@test.local`;
  const newPassword = "new-password-654321";

  beforeAll(async () => {
    mocks.reset.mockClear();
    createdUserEmails.push(email);
    const user = await signUpUser({ email });
    // requireEmailVerification: only a verified account can sign in at all.
    await db
      .update(userTable)
      .set({ emailVerified: true })
      .where(eq(userTable.id, user.id));
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

  it("a completed reset invalidates the old session cookie", async () => {
    const email = `${tag}-reset-old@test.local`;
    createdUserEmails.push(email);
    const user = await signUpUser({ email });
    await db
      .update(userTable)
      .set({ emailVerified: true })
      .where(eq(userTable.id, user.id));
    const oldCookie = await signInCookie(email);

    const auth = getAuth();
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: new Headers(),
    });
    const url = (mocks.reset.mock.calls.at(-1) as unknown as [{ url: string }])[0]
      .url;
    const token = new URL(url).pathname.split("/").pop()!;
    await auth.api.resetPassword({
      body: { newPassword: "reset-again-654321", token },
      headers: new Headers(),
    });

    // The pre-reset cookie no longer authenticates (revokeSessionsOnPasswordReset):
    // a request with it is treated as unauthorized.
    const res = await checkout(req({ sessionId, phone: "0888123456" }, oldCookie));
    expect(res.status).toBe(401);
    const [staleSession] = await db
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(eq(sessionTable.userId, user.id));
    expect(staleSession).toBeUndefined();
  });
});

describe("admin role", () => {
  it("a non-admin is rejected by assertAdmin", async () => {
    const email = `${tag}-user@test.local`;
    createdUserEmails.push(email);
    await signUpUser({ email });
    await verifyUserEmail(email);
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
    await verifyUserEmail(email);
    await db.update(userTable).set({ role: "admin" }).where(eq(userTable.email, email));
    const cookie = await signInCookie(email);
    headerState.headers.set("cookie", cookie);

    // No booking with id 999999 exists: nothing happens, but no rejection either.
    await expect(confirmCashBooking(999999)).resolves.toBeUndefined();
  });
});

describe("admin role vs email verification", () => {
  it("an admin whose email is not verified is rejected by assertAdmin", async () => {
    const email = `${tag}-unvadmin@test.local`;
    createdUserEmails.push(email);
    const u = await signUpUser({ email });
    await verifyUserEmail(email);
    await db.update(userTable).set({ role: "admin" }).where(eq(userTable.email, email));
    const cookie = await signInCookie(email);
    headerState.headers.set("cookie", cookie);
    // Flip verification off after the session exists: the role alone must not be enough.
    await db
      .update(userTable)
      .set({ emailVerified: false })
      .where(eq(userTable.id, u.id));

    await expect(confirmCashBooking(999999)).rejects.toThrow(
      "Нямаш права за администратор."
    );
  });
});
