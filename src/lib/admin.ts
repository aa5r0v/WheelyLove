import { getSession } from "./auth";

// The role lives in our own user table (see src/db/schema.ts); it is set only
// via scripts/set-admin.ts and read here on the server.
export async function isAdmin() {
  const session = await getSession();
  // The address must also be verified: the admin role must never work for an
  // account whose email was never confirmed (defense in depth on top of
  // requireEmailVerification, which already blocks unverified sign-ins).
  return session?.user.role === "admin" && session.user.emailVerified === true;
}
