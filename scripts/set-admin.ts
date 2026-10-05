import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { account, session, user } from "../src/db/schema";

// Grants the admin role by email:  npm run set-admin -- adelinа@example.com
// The role lives in our own user table (Better Auth); it is never settable
// through the web app itself.
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run set-admin -- <email>");
    process.exit(1);
  }

  const db = getDb();
  // Better Auth stores emails lowercased.
  const [found] = await db
    .select({ id: user.id, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.email, email));

  if (!found) {
    console.error(`No user with email ${email}. Sign up in the app first.`);
    process.exit(1);
  }
  // The address must be confirmed first: without this check the script could
  // promote an account that was pre-registered with someone else's email.
  if (!found.emailVerified) {
    console.error(
      `${email} has not verified their email yet. ` +
        "Ask them to sign in (a new confirmation link is sent) and click it, then retry."
    );
    process.exit(1);
  }

  await db.update(user).set({ role: "admin" }).where(eq(user.id, found.id));
  // Sign out everything issued so far, so no session from before the promotion
  // keeps running with (or without) the old privileges.
  await db.delete(session).where(eq(session.userId, found.id));
  // The account may have been pre-registered with the studio's address by
  // someone else (the owner clicked THEIR confirmation link, but the password
  // is theirs). better-auth's sign-in treats a NULL credential password as
  // "no valid credential" and rejects the sign-in (dist/api/routes/sign-in.mjs:
  // `if (!currentPassword) ... throw UNAUTHORIZED INVALID_EMAIL_OR_PASSWORD`),
  // so nobody can sign in until the owner sets a fresh password.
  await db
    .update(account)
    .set({ password: null })
    .where(and(eq(account.userId, found.id), eq(account.providerId, "credential")));

  console.log(`${email} is now an admin. Existing sessions were signed out.`);
  console.log(
    "The account password was invalidated: the owner must set a new one via " +
      "\u201cЗабравена парола\u201d (forgot password) before signing in."
  );
}

// The DB connection pool keeps the process alive, so exit explicitly
// (same as scripts/check.ts).
main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
