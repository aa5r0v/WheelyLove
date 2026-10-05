import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { account, rateLimit, session, user, verification } from "@/db/schema";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";

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
      // The reset email always looks the same, whether or not the address exists.
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail({ to: user.email, url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
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
