// Test-only helpers: real Better Auth users and session cookies against the test DB.
// The auth emails are always mocked in tests (see the *.test.ts files), and the
// built-in rate limiter's buckets (rate_limit table) are cleared on every call so
// repeated runs never trip the sign-in/sign-up limits.
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rateLimit, user as userTable } from "@/db/schema";
import { getAuth } from "@/lib/auth";

process.env.BETTER_AUTH_SECRET ||= "test-only-secret-0123456789abcdef0123456789abcdef";

// A random per-process "client IP" keeps the auth rate-limit buckets isolated.
const CLIENT_IP = `10.${rand()}.${rand()}.${rand()}`;
function rand() {
  return String(Math.floor(Math.random() * 250));
}

export const DEFAULT_PASSWORD = "test-password-123456";

async function authHeaders() {
  const db = getDb();
  await db.delete(rateLimit);
  return new Headers({ "cf-connecting-ip": CLIENT_IP });
}

export async function signUpUser(opts: { email: string; name?: string; password?: string }) {
  const auth = getAuth();
  const res = await auth.api.signUpEmail({
    body: {
      name: opts.name ?? "Тест Потребител",
      email: opts.email,
      password: opts.password ?? DEFAULT_PASSWORD,
    },
    headers: await authHeaders(),
  });
  return res.user;
}

// Signs in and returns a Cookie header value that authenticates Requests and the
// mocked next/headers. The real signed cookie is taken from the response headers
// (the raw session token from the body is not what the browser sends).
export async function signInCookie(
  email: string,
  password: string = DEFAULT_PASSWORD
): Promise<string> {
  const auth = getAuth();
  const res = (await auth.api.signInEmail({
    body: { email, password },
    headers: await authHeaders(),
    returnHeaders: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as { headers: Headers };
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .find((c) => /^(__Secure-)?better-auth\.session_token=/.test(c));
  if (!cookie) throw new Error("sign-in did not set a session cookie");
  return cookie;
}

export async function verifyUserEmail(email: string) {
  const db = getDb();
  await db
    .update(userTable)
    .set({ emailVerified: true })
    .where(eq(userTable.email, email.toLowerCase()));
}

// Registers a user, verifies the email (directly in the DB) and signs in.
export async function makeVerifiedUser(tag: string): Promise<string> {
  const email = `${tag}@test.local`;
  await signUpUser({ email });
  await verifyUserEmail(email);
  return signInCookie(email);
}

export async function deleteUser(email: string) {
  const db = getDb();
  await db.delete(userTable).where(eq(userTable.email, email.toLowerCase()));
}
