import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

const mocks = vi.hoisted(() => ({ fn: vi.fn(async () => {}) }));
vi.mock("@/lib/email", () => ({
  sendBookingConfirmationEmail: mocks.fn,
  sendBookingCancelledEmail: mocks.fn,
  sendBookingReminderEmail: mocks.fn,
  sendWaitlistSpotOpenEmail: mocks.fn,
  sendVerificationEmail: mocks.fn,
  sendPasswordResetEmail: mocks.fn,
  sendExistingAccountEmail: mocks.fn,
}));
const headerState = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => headerState.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports, user as userTable } from "@/db/schema";
import { POST as checkout } from "@/app/api/checkout/route";
import { getOwnPhone, updateOwnPhone } from "@/app/[locale]/my-bookings/actions";
import { deleteUser, makeVerifiedUser } from "@/lib/test-helpers";

const db = getDb();
const tag = `uphone-${Date.now()}`;
let sportId: number;
let instructorId: number;
const sessionIds: number[] = [];
const emails: string[] = [];

async function makeSession() {
  const start = Date.now() + 86400000;
  const [s] = await db
    .insert(classSessions)
    .values({
      sportId,
      instructorId,
      startTime: new Date(start),
      endTime: new Date(start + 3600000),
      capacity: 5,
      priceCents: 600,
    })
    .returning();
  sessionIds.push(s.id);
  return s;
}
function req(body: unknown, cookie: string) {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify(body),
  });
}
async function newUser(name: string) {
  emails.push(`${tag}-${name}@test.local`);
  const cookie = await makeVerifiedUser(`${tag}-${name}`);
  const [u] = await db.select().from(userTable).where(eq(userTable.email, emails.at(-1)!));
  return { cookie, id: u.id };
}
async function savedOf(id: string) {
  const [u] = await db.select({ p: userTable.phone }).from(userTable).where(eq(userTable.id, id));
  return u.p;
}

beforeAll(async () => {
  const [sp] = await db.insert(sports).values({ slug: `${tag}-s`, name: "T" }).returning();
  sportId = sp.id;
  const [ins] = await db.insert(instructors).values({ slug: `${tag}-i`, name: "T" }).returning();
  instructorId = ins.id;
});
afterAll(async () => {
  if (sessionIds.length) {
    await db.delete(bookings).where(inArray(bookings.sessionId, sessionIds));
    await db.delete(classSessions).where(inArray(classSessions.id, sessionIds));
  }
  await db.delete(instructors).where(eq(instructors.id, instructorId));
  await db.delete(sports).where(eq(sports.id, sportId));
  for (const e of emails) await deleteUser(e);
});

describe("saved phone", () => {
  it("a first booking with a foreign number saves it to the profile; the booking keeps its snapshot", async () => {
    const { cookie, id } = await newUser("first");
    expect(await savedOf(id)).toBeNull();
    const s = await makeSession();
    const res = await checkout(req({ sessionId: s.id, phone: "+49 151 1234 5678" }, cookie));
    expect(res.status).toBe(200);
    expect(await savedOf(id)).toBe("+4915112345678");
    const [b] = await db.select().from(bookings).where(eq(bookings.sessionId, s.id));
    expect(b.userPhone).toBe("+4915112345678");
  });

  it("booking with a changed number updates the profile, the old booking keeps its old snapshot", async () => {
    const { cookie, id } = await newUser("change");
    const s1 = await makeSession();
    await checkout(req({ sessionId: s1.id, phone: "0888123456" }, cookie));
    const s2 = await makeSession();
    await checkout(req({ sessionId: s2.id, phone: "+40712345678" }, cookie));
    expect(await savedOf(id)).toBe("+40712345678");
    const [b1] = await db.select().from(bookings).where(eq(bookings.sessionId, s1.id));
    expect(b1.userPhone).toBe("+359888123456");
  });

  it("an invalid number is rejected and nothing is saved", async () => {
    const { cookie, id } = await newUser("bad");
    const s = await makeSession();
    const res = await checkout(req({ sessionId: s.id, phone: "+0123456789" }, cookie));
    expect(res.status).toBe(400);
    expect(await savedOf(id)).toBeNull();
  });
});

describe("own-phone server actions", () => {
  it("updateOwnPhone changes only the signed-in user's phone and getOwnPhone reads it", async () => {
    const a = await newUser("a");
    const b = await newUser("b");
    headerState.headers = new Headers({ cookie: a.cookie });
    const res = await updateOwnPhone("+40 712 345 678");
    expect(res).toEqual({ ok: true, phone: "+40712345678" });
    expect(await savedOf(a.id)).toBe("+40712345678");
    expect(await savedOf(b.id)).toBeNull();
    expect(await getOwnPhone()).toBe("+40712345678");
  });

  it("updateOwnPhone validates on the server and requires a session", async () => {
    const a = await newUser("c");
    headerState.headers = new Headers({ cookie: a.cookie });
    expect((await updateOwnPhone("12345")).ok).toBe(false);
    expect((await updateOwnPhone(42 as unknown as string)).ok).toBe(false);
    expect(await savedOf(a.id)).toBeNull();
    headerState.headers = new Headers();
    expect((await updateOwnPhone("+40712345678")).ok).toBe(false);
    expect(await getOwnPhone()).toBeNull();
  });
});
