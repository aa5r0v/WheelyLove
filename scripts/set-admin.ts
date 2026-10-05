import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { user } from "../src/db/schema";

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
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));

  if (!found) {
    console.error(`No user with email ${email}. Sign up in the app first.`);
    process.exit(1);
  }

  await db.update(user).set({ role: "admin" }).where(eq(user.id, found.id));

  console.log(`${email} is now an admin.`);
}

main();
