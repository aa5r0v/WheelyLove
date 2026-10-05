import { describe, it, expect, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";

// Registering test users triggers sendOnSignUp; auth emails must never leave.
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

// isAdmin() resolves the session through next/headers, like the admin actions.
const headerState = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => headerState.headers,
}));

import { getDb } from "@/db";
import { user as userTable } from "@/db/schema";
import {
  deleteUser,
  signInCookie,
  signUpUser,
  verifyUserEmail,
} from "@/lib/test-helpers";
import { GET } from "./route";

const tag = `admchk-${Date.now()}`;
const db = getDb();
const createdUserEmails: string[] = [];

function setCookieHeader(cookie?: string) {
  headerState.headers = new Headers(cookie ? { cookie } : undefined);
}

afterAll(async () => {
  for (const email of createdUserEmails) await deleteUser(email);
});

// nginx proxies GET /api/internal/admin-check as an auth_request subrequest
// (deploy/nginx/wheelylove.conf): 204 lets the 55 MB gallery upload through,
// anything else rejects the request before its body is proxied. The verdict
// must match assertAdmin exactly: a valid session whose user is an admin AND
// has a verified email.
// Sign-up/sign-in run several scrypt hashes; on a busy machine that can
// exceed vitest's default 5 s per test (same as scripts/set-admin.test.ts).
const SLOW_AUTH = 30_000;

describe("GET /api/internal/admin-check", () => {
  it("answers 403 without a session cookie", async () => {
    setCookieHeader();
    expect((await GET()).status).toBe(403);
  });

  it("answers 403 for a signed-in non-admin", { timeout: SLOW_AUTH }, async () => {
    const email = `${tag}-user@test.local`;
    createdUserEmails.push(email);
    await signUpUser({ email });
    await verifyUserEmail(email);
    setCookieHeader(await signInCookie(email));
    expect((await GET()).status).toBe(403);
  });

  it("answers 403 for an admin whose email is not verified", { timeout: SLOW_AUTH }, async () => {
    const email = `${tag}-unvadmin@test.local`;
    createdUserEmails.push(email);
    const u = await signUpUser({ email });
    await verifyUserEmail(email);
    await db.update(userTable).set({ role: "admin" }).where(eq(userTable.id, u.id));
    setCookieHeader(await signInCookie(email));
    // Flip verification off while the session is live: the role alone must not pass.
    await db.update(userTable).set({ emailVerified: false }).where(eq(userTable.id, u.id));
    expect((await GET()).status).toBe(403);
  });

  it("answers 204 for a verified admin", { timeout: SLOW_AUTH }, async () => {
    const email = `${tag}-admin@test.local`;
    createdUserEmails.push(email);
    await signUpUser({ email });
    await verifyUserEmail(email);
    await db.update(userTable).set({ role: "admin" }).where(eq(userTable.email, email));
    setCookieHeader(await signInCookie(email));
    expect((await GET()).status).toBe(204);
  });
});
