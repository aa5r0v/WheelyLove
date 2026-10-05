import { describe, it, expect, afterAll, vi } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";

// set-admin itself never sends email, but the test helpers register real
// Better Auth users, which triggers sendOnSignUp - mock the senders as usual.
const mocks = vi.hoisted(() => ({
  email: vi.fn(async () => {}),
  verification: vi.fn(async () => {}),
  reset: vi.fn(async () => {}),
  existing: vi.fn(async () => {}),
}));

vi.mock("@/lib/email", () => ({
  sendBookingConfirmationEmail: mocks.email,
  sendBookingCancelledEmail: mocks.email,
  sendBookingReminderEmail: mocks.email,
  sendWaitlistSpotOpenEmail: mocks.email,
  sendVerificationEmail: mocks.verification,
  sendPasswordResetEmail: mocks.reset,
  sendExistingAccountEmail: mocks.existing,
}));

import { getDb } from "../src/db";
import {
  rateLimit as rateLimitTable,
  session as sessionTable,
  user as userTable,
} from "../src/db/schema";
import { getAuth } from "../src/lib/auth";
import {
  DEFAULT_PASSWORD,
  deleteUser,
  signInCookie,
  signUpUser,
  verifyUserEmail,
} from "../src/lib/test-helpers";

const execFileAsync = promisify(execFile);
const db = getDb();
const tag = `setadmin-${Date.now()}`;
const createdUserEmails: string[] = [];

// Runs the real CLI (tsx scripts/set-admin.ts) as a child process with the
// test environment inherited, and reports exit code + output either way.
async function runSetAdmin(email: string) {
  const args = [
    path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
    "scripts/set-admin.ts",
    email,
  ];
  const options = { cwd: process.cwd(), env: process.env };
  return execFileAsync(process.execPath, args, options).then(
    (r) => ({ code: 0 as number, stdout: r.stdout as string, stderr: r.stderr as string }),
    (e) => ({
      code: typeof e.code === "number" ? e.code : 1,
      stdout: (e.stdout as string) ?? "",
      stderr: (e.stderr as string) ?? "",
    })
  );
}

afterAll(async () => {
  for (const email of createdUserEmails) await deleteUser(email);
});

describe("set-admin", () => {
  // tsx cold-start under Windows takes seconds; the assertions are unaffected.
  const SLOW_CLI = 60_000;

  it("refuses (non-zero exit) a user whose email is not verified", { timeout: SLOW_CLI }, async () => {
    const email = `${tag}-unverified@test.local`;
    createdUserEmails.push(email);
    const u = await signUpUser({ email });
    // note: no verifyUserEmail here

    const r = await runSetAdmin(email);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/not verified/i);

    const [row] = await db
      .select({ role: userTable.role })
      .from(userTable)
      .where(eq(userTable.id, u.id));
    expect(row.role).not.toBe("admin");
  });

  it("refuses an unknown email (non-zero exit)", { timeout: SLOW_CLI }, async () => {
    const r = await runSetAdmin(`${tag}-missing@test.local`);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/No user with email/i);
  });

  it("promotes a verified user and deletes their existing sessions", { timeout: SLOW_CLI }, async () => {
    const email = `${tag}-ok@test.local`;
    createdUserEmails.push(email);
    const u = await signUpUser({ email });
    await verifyUserEmail(email);
    // Sign in once so the user has a live session for the script to delete.
    await signInCookie(email);

    const before = await db
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(eq(sessionTable.userId, u.id));
    expect(before.length).toBeGreaterThan(0);

    const r = await runSetAdmin(email);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/is now an admin/i);

    const [row] = await db
      .select({ role: userTable.role })
      .from(userTable)
      .where(eq(userTable.id, u.id));
    expect(row.role).toBe("admin");

    const after = await db
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(eq(sessionTable.userId, u.id));
    expect(after).toHaveLength(0);
  });

  it("after promotion the old password no longer signs in (real sign-in)", { timeout: SLOW_CLI }, async () => {
    const email = `${tag}-pw@test.local`;
    createdUserEmails.push(email);
    await signUpUser({ email });
    await verifyUserEmail(email);

    const r = await runSetAdmin(email);
    expect(r.code).toBe(0);

    // A pre-registered account must not keep working with the attacker's
    // password after promotion: the credential is invalidated by the script.
    await db.delete(rateLimitTable);
    await expect(
      getAuth().api.signInEmail({
        body: { email, password: DEFAULT_PASSWORD },
        headers: new Headers(),
      })
    ).rejects.toThrow();
  });
});
