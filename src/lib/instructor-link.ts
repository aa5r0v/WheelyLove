import { and, eq, inArray } from "drizzle-orm";
import { getDb, type DbOrTx } from "../db";
import { account, instructors, session, user } from "../db/schema";

// Linking an instructor to a login account. Relative imports on purpose: the
// CLI (scripts/set-instructor.ts) runs from the slim `migrate` image.

export type LinkResult =
  | { ok: true; userId: string; email: string; credentialsReset: boolean }
  | {
      ok: false;
      error:
        | "user_not_found"
        | "email_not_verified"
        | "is_admin"
        | "instructor_not_found"
        | "instructor_archived"
        | "instructor_has_account"
        | "user_linked_elsewhere";
      message: string;
    };

const MESSAGES = {
  user_not_found: "Няма регистриран потребител с този имейл.",
  email_not_verified: "Имейлът на този акаунт още не е потвърден.",
  is_admin: "Администраторски акаунт не може да бъде свързан като инструктор.",
  instructor_not_found: "Инструкторът не съществува.",
  instructor_archived: "Този инструктор е архивиран и не може да бъде свързан с акаунт.",
  instructor_has_account: "Този инструктор вече е свързан с акаунт. Първо махни достъпа.",
  user_linked_elsewhere: "Този акаунт вече е свързан с друг инструктор.",
} as const;

function fail(error: keyof typeof MESSAGES): LinkResult {
  return { ok: false, error, message: MESSAGES[error] };
}

// Sets user.role = "instructor" and instructors.user_id in ONE transaction.
// The role update is conditional (role is user/instructor), so an account that
// is promoted to admin concurrently can never end up as an instructor.
// The instructors row is locked FOR UPDATE before it is read, so linking races
// with archiving (instructor-lifecycle.ts) on the same row lock instead of
// interleaving.
export async function linkInstructorAccount(opts: {
  email: string;
  instructor: { id: number } | { slug: string };
}): Promise<LinkResult> {
  const email = opts.email.trim().toLowerCase();
  const target = opts.instructor;
  const db = getDb();
  return db.transaction(async (tx) => {
    const [u] = await tx
      .select({ id: user.id, role: user.role, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email));
    if (!u) return fail("user_not_found");
    if (u.role === "admin") return fail("is_admin");
    if (!u.emailVerified) return fail("email_not_verified");

    const [ins] = await tx
      .select({ id: instructors.id, userId: instructors.userId, archivedAt: instructors.archivedAt })
      .from(instructors)
      .where("id" in target ? eq(instructors.id, target.id) : eq(instructors.slug, target.slug))
      .for("update");
    if (!ins) return fail("instructor_not_found");
    if (ins.archivedAt) return fail("instructor_archived");
    if (ins.userId && ins.userId !== u.id) return fail("instructor_has_account");

    const [other] = await tx
      .select({ id: instructors.id })
      .from(instructors)
      .where(eq(instructors.userId, u.id));
    if (other && other.id !== ins.id) return fail("user_linked_elsewhere");

    const promoted = await tx
      .update(user)
      .set({ role: "instructor" })
      .where(and(eq(user.id, u.id), inArray(user.role, ["user", "instructor"])))
      .returning({ id: user.id });
    if (promoted.length === 0) return fail("is_admin");

    await tx.update(instructors).set({ userId: u.id }).where(eq(instructors.id, ins.id));
    // The account may have been pre-registered by someone else with the
    // instructor's address (the owner then verified THEIR link). Like
    // set-admin: always sign everything out and invalidate the credential
    // password, so the instructor must set a fresh one via "forgot password".
    // Skipped only when the account is already linked to this very instructor.
    const alreadyLinked = ins.userId === u.id;
    if (!alreadyLinked) {
      await tx.delete(session).where(eq(session.userId, u.id));
      await tx
        .update(account)
        .set({ password: null })
        .where(and(eq(account.userId, u.id), eq(account.providerId, "credential")));
    }
    return { ok: true, userId: u.id, email, credentialsReset: !alreadyLinked };
  });
}

// Removes the access inside a caller-owned transaction: the link is cut, the
// account's sessions are revoked and an "instructor" role goes back to "user"
// (an admin role is never touched; the conditional update skips it). The
// instructors row is locked, so this cannot interleave with linking or
// archiving on the same instructor.
export async function unlinkInstructorWithinTx(tx: DbOrTx, instructorId: number): Promise<boolean> {
  const [ins] = await tx
    .select({ userId: instructors.userId })
    .from(instructors)
    .where(eq(instructors.id, instructorId))
    .for("update");
  if (!ins?.userId) return false;
  await tx.update(instructors).set({ userId: null }).where(eq(instructors.id, instructorId));
  await tx.delete(session).where(eq(session.userId, ins.userId));
  await tx
    .update(user)
    .set({ role: "user" })
    .where(and(eq(user.id, ins.userId), eq(user.role, "instructor")));
  return true;
}

// Removes the access: the link is cut and an "instructor" role goes back to
// "user" (an admin role is never touched).
export async function unlinkInstructorAccount(instructorId: number): Promise<{ ok: boolean }> {
  const ok = await getDb().transaction((tx) => unlinkInstructorWithinTx(tx, instructorId));
  return { ok };
}
