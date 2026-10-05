import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { account, rateLimit, session, user, verification } from "@/db/schema";
import {
  sendExistingAccountEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "./email";

// Self-hosted auth (email + password) in our own Postgres. No third-party
// identity provider: only Resend is called, for the auth emails.
const appUrl = (process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(
  /\/+$/,
  ""
);

function createAuth() {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    ...(appUrl ? { baseURL: appUrl, trustedOrigins: [appUrl] } : {}),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification, rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      // Nobody can occupy an address they do not control: an account without a
      // verified email cannot sign in at all, and a completed password reset
      // deletes every session of the account (incl. an attacker's pre-registered
      // one). Both default to false in better-auth, hence the explicit `true`.
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      // The reset email always looks the same, whether or not the address exists.
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail({ to: user.email, url });
      },
      // A sign-up attempt on an already-registered address must reach the
      // OWNER of that address (someone may be trying to occupy it) with a
      // forgot-password link. Dispatched exactly like the verification letter
      // below, through the same runInBackgroundOrAwait in better-auth's
      // sign-up route.
      onExistingUserSignUp: async ({ user }) => {
        await sendExistingAccountEmail({ to: user.email });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // When an unverified user tries to sign in we send them a fresh link
      // (the 403 message shown by /sign-in promises exactly that).
      sendOnSignIn: true,
      // 24 h on purpose - the email copy says "валиден е 24 часа". The library
      // default is 3600 (1 h), see createEmailVerificationToken in better-auth.
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail({ to: user.email, url });
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          // Never accepted from client input (sign-up / update-user).
          input: false,
        },
      },
    },
    rateLimit: {
      enabled: true,
      // Survives container restarts and is shared between replicas.
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 5 },
      },
    },
    advanced: {
      // Behind Cloudflare -> nginx the real client IP is in cf-connecting-ip
      // (nginx passes it on explicitly, see deploy/nginx/wheelylove-proxy.conf).
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      defaultCookieAttributes: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    },
  });
}

let _auth: ReturnType<typeof createAuth> | null = null;

export function getAuth() {
  if (!_auth) _auth = createAuth();
  return _auth;
}

export type Auth = ReturnType<typeof getAuth>;

// Route handlers have the Request at hand and pass its headers; server
// components/actions fall back to next/headers.
export async function getSession(reqHeaders?: Headers) {
  const h = reqHeaders ?? (await headers());
  return getAuth().api.getSession({ headers: h });
}
