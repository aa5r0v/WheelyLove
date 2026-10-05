import { describe, it, expect, afterAll, vi } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";

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
import { instructors, session as sessionTable, user as userTable } from "../src/db/schema";
import { getAuth } from "../src/lib/auth";
import { DEFAULT_PASSWORD, deleteUser, signInCookie, signUpUser, verifyUserEmail } from "../src/lib/test-helpers";

const execFileAsync = promisify(execFile);
const db = getDb();
const tag = `setins-${Date.now()}`;
const emails: string[] = [];
const slug = `${tag}-i`;
const SLOW_CLI = 60_000;

async function run(...args: string[]) {
  const cli = [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), "scripts/set-instructor.ts", ...args];
  return execFileAsync(process.execPath, cli, { cwd: process.cwd(), env: process.env }).then(
    (r) => ({ code: 0, stdout: r.stdout as string, stderr: r.stderr as string }),
    (e) => ({ code: typeof e.code === "number" ? e.code : 1, stdout: (e.stdout as string) ?? "", stderr: (e.stderr as string) ?? "" })
  );
}

const roleOf = async (id: string) =>
  (await db.select({ r: userTable.role }).from(userTable).where(eq(userTable.id, id)))[0].r;

afterAll(async () => {
  await db.delete(instructors).where(eq(instructors.slug, slug));
  for (const e of emails) await deleteUser(e);
});

describe("set-instructor", () => {
  it("refuses an unverified email, an admin, an unknown user and an unknown instructor", { timeout: SLOW_CLI }, async () => {
    await db.insert(instructors).values({ slug, name: "T" });
    const unverified = `${tag}-unver@test.local`;
    const admin = `${tag}-admin@test.local`;
    emails.push(unverified, admin);
    const u = await signUpUser({ email: unverified });
    const a = await signUpUser({ email: admin });
    await verifyUserEmail(admin);
    await db.update(userTable).set({ role: "admin" }).where(eq(userTable.id, a.id));

    const r1 = await run(unverified, slug);
    expect(r1.code).not.toBe(0);
    expect(r1.stderr).toMatch(/not verified/i);
    expect(await roleOf(u.id)).toBe("user");

    const r2 = await run(admin, slug);
    expect(r2.code).not.toBe(0);
    expect(r2.stderr).toMatch(/admin/i);
    expect(await roleOf(a.id)).toBe("admin");

    const r3 = await run(`${tag}-nobody@test.local`, slug);
    expect(r3.code).not.toBe(0);
    expect(r3.stderr).toMatch(/No user with email/i);

    await verifyUserEmail(unverified);
    const r4 = await run(unverified, `${tag}-missing`);
    expect(r4.code).not.toBe(0);
    expect(r4.stderr).toMatch(/No instructor with slug/i);
    expect(await roleOf(u.id)).toBe("user");
  });

  it("links a verified user, sets the role and deletes their sessions", { timeout: SLOW_CLI }, async () => {
    const email = `${tag}-ok@test.local`;
    emails.push(email);
    const u = await signUpUser({ email });
    await verifyUserEmail(email);
    await signInCookie(email);
    expect((await db.select().from(sessionTable).where(eq(sessionTable.userId, u.id))).length).toBeGreaterThan(0);

    const r = await run(email, slug);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/is now the instructor/);
    expect(await roleOf(u.id)).toBe("instructor");
    const [ins] = await db.select().from(instructors).where(eq(instructors.slug, slug));
    expect(ins.userId).toBe(u.id);
    expect(await db.select().from(sessionTable).where(eq(sessionTable.userId, u.id))).toHaveLength(0);
    // H1: the password set before the link (possibly by an attacker) is dead.
    expect(r.stdout).toMatch(/Забравена парола/);
    await expect(
      getAuth().api.signInEmail({ body: { email, password: DEFAULT_PASSWORD }, headers: new Headers() })
    ).rejects.toThrow();
  });
});
