import { getSession } from "./auth";

// The role lives in our own user table (see src/db/schema.ts); it is set only
// via scripts/set-admin.ts and read here on the server.
export async function isAdmin() {
  const session = await getSession();
  return session?.user.role === "admin";
}
