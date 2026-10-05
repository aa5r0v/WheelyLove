import { linkInstructorAccount } from "../src/lib/instructor-link";

// Gives an existing account the instructor role and links it to an instructor:
//   npm run set-instructor -- <email> <instructor-slug>
// Like set-admin: the role lives in our own user table and is never settable
// through the web app by the user himself. The email must be verified; every
// existing session of the account is deleted after the change.
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const slug = process.argv[3]?.trim();
  if (!email || !slug) {
    console.error("Usage: npm run set-instructor -- <email> <instructor-slug>");
    process.exit(1);
  }

  const r = await linkInstructorAccount({ email, instructor: { slug } });
  if (!r.ok) {
    const hint: Record<string, string> = {
      user_not_found: `No user with email ${email}. Sign up in the app first.`,
      email_not_verified:
        `${email} has not verified their email yet (not verified). ` +
        "Ask them to sign in (a new confirmation link is sent) and click it, then retry.",
      is_admin: `${email} is an admin account; an admin cannot be linked as an instructor.`,
      instructor_not_found: `No instructor with slug ${slug}.`,
      instructor_has_account: `Instructor ${slug} is already linked to an account. Remove the access in /admin/instructors first.`,
      user_linked_elsewhere: `${email} is already linked to another instructor.`,
    };
    console.error(hint[r.error] ?? r.message);
    process.exit(1);
  }
  console.log(`${email} is now the instructor ${slug}.`);
  if (r.credentialsReset) {
    console.log(
      "Existing sessions were signed out and the account password was invalidated: " +
        "the instructor must first set a new one via “Забравена парола” (forgot password)."
    );
  }
}

// The DB connection pool keeps the process alive, so exit explicitly
// (same as scripts/set-admin.ts).
main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
