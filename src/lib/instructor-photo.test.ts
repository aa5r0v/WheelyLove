import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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

// Server actions resolve the session through next/headers.
const headerState = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => headerState.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDb } from "@/db";
import { instructors, user as userTable } from "@/db/schema";
import {
  createInstructor,
  deleteInstructor,
  removeInstructorPhoto,
  updateInstructor,
  uploadInstructorPhoto,
} from "@/app/[locale]/admin/actions";
import { deleteUser, signInCookie, signUpUser, verifyUserEmail } from "@/lib/test-helpers";
import { MAX_IMAGE_BYTES } from "@/lib/storage";

const db = getDb();
const tag = `insphoto-${Date.now()}`;

// Real bytes, not just magic numbers where it matters.
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d494844520000000100000001080600000" +
    "01f15c4890000000d49444154789c62000100000500010d0a2db40000000049454e44ae426082",
  "hex"
);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from("ftypmp42"),
  Buffer.alloc(8),
]);

const as = (cookie?: string) => {
  headerState.headers = cookie ? new Headers({ cookie }) : new Headers();
};

async function makeUser(name: string, role: string, opts: { verified?: boolean } = {}) {
  const email = `${tag}-${name}@test.local`;
  await signUpUser({ email });
  await verifyUserEmail(email);
  await db.update(userTable).set({ role }).where(eq(userTable.email, email.toLowerCase()));
  const cookie = await signInCookie(email);
  if (opts.verified === false) {
    await db.update(userTable).set({ emailVerified: false }).where(eq(userTable.email, email.toLowerCase()));
  }
  return { id: "", email, cookie };
}

const userEmails: string[] = [];
const instructorIds: number[] = [];

async function makeInstructor(
  name: string,
  o: { photoUrl?: string | null } = {}
) {
  const [i] = await db
    .insert(instructors)
    .values({
      slug: `${tag}-${name}`,
      name,
      bio: "Био по подразбиране.",
      specialties: "Тест",
      photoUrl: o.photoUrl ?? null,
    })
    .returning();
  instructorIds.push(i.id);
  return i;
}

const row = async (id: number) =>
  (await db.select().from(instructors).where(eq(instructors.id, id)))[0];

const fileOf = (url: string) => path.join(uploadDir, path.basename(url));
const dirFiles = async () => (await readdir(uploadDir)).sort();
const exists = async (p: string) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

const photoForm = (file: File) => {
  const f = new FormData();
  f.set("photo", file);
  return f;
};
const pngFile = () => new File([PNG], "photo.png", { type: "image/png" });
const profileForm = (o: Record<string, string> = {}) => {
  const f = new FormData();
  f.set("name", "Име Инструктор");
  f.set("slug", `${tag}-${Math.random().toString(36).slice(2, 8)}`);
  f.set("specialties", "");
  f.set("phone", "");
  f.set("email", "");
  f.set("bio", "");
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

let uploadDir: string;
let adminCookie: string;
let P: Awaited<ReturnType<typeof makeInstructor>>; // photo play target
let O: Awaited<ReturnType<typeof makeInstructor>>; // slug duplicate target

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "wl-insphoto-"));
  process.env.UPLOAD_DIR = uploadDir;
  const admin = await makeUser("admin", "admin");
  adminCookie = admin.cookie;
  userEmails.push(admin.email);
  P = await makeInstructor("main");
  O = await makeInstructor("other");
});

afterAll(async () => {
  if (instructorIds.length)
    await db.delete(instructors).where(inArray(instructors.id, instructorIds));
  for (const e of userEmails) await deleteUser(e);
  await rm(uploadDir, { recursive: true, force: true });
});

describe("uploadInstructorPhoto: auth comes first", () => {
  it("guest, client, instructor and unverified admin are refused with NO file written and NO DB change", async () => {
    const client = await makeUser("client", "user");
    const ins = await makeUser("ins", "instructor");
    const unverified = await makeUser("unver", "admin", { verified: false });
    userEmails.push(client.email, ins.email, unverified.email);

    for (const cookie of [undefined, client.cookie, ins.cookie, unverified.cookie]) {
      as(cookie);
      await expect(uploadInstructorPhoto(P.id, photoForm(pngFile()))).rejects.toThrow(
        "Нямаш права за администратор."
      );
      await expect(removeInstructorPhoto(P.id)).rejects.toThrow(
        "Нямаш права за администратор."
      );
    }
    expect(await dirFiles()).toEqual([]); // nothing was saved to disk
    expect((await row(P.id)).photoUrl).toBeNull(); // nothing was mutated
    as(); // leave no cookie behind
  });

  it("a second verified admin has exactly the same capability", async () => {
    const second = await makeUser("admin2", "admin");
    userEmails.push(second.email);
    as(second.cookie);
    const r = await uploadInstructorPhoto(P.id, photoForm(pngFile()));
    expect(r.ok).toBeTruthy();
    expect(r.photoUrl).toMatch(/^\/uploads\/[0-9a-f-]{36}\.(png|jpg|webp)$/);
    // cleanup: remove it again so later tests start from a clean state
    expect((await removeInstructorPhoto(P.id)).ok).toBeTruthy();
    expect(await dirFiles()).toEqual([]);
    as();
  });
});

describe("uploadInstructorPhoto: byte-level validation", () => {
  beforeAll(() => as(adminCookie));

  it("missing or empty photo entry is a readable error", async () => {
    expect((await uploadInstructorPhoto(P.id, new FormData())).error).toMatch(
      /Избери снимка/
    );
    expect(
      (await uploadInstructorPhoto(P.id, photoForm(new File([], "empty.png", { type: "image/png" })))).error
    ).toMatch(/Избери снимка/);
    expect(await dirFiles()).toEqual([]);
  });

  it("rejects an image over 8 MB (real bytes) before writing anything", async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES)]);
    const r = await uploadInstructorPhoto(P.id, photoForm(new File([big], "big.jpg", { type: "image/jpeg" })));
    expect(r.error).toMatch(/до 8 MB/);
    expect(await dirFiles()).toEqual([]);
  });

  it("rejects MP4 video and spoofed text declared as an image", async () => {
    expect(
      (await uploadInstructorPhoto(P.id, photoForm(new File([MP4], "v.mp4", { type: "video/mp4" })))).error
    ).toMatch(/само JPEG, PNG и WebP/);
    expect(
      (
        await uploadInstructorPhoto(
          P.id,
          photoForm(new File([Buffer.from("<html><script>alert(1)</script>")], "fake.png", { type: "image/png" }))
        )
      ).error
    ).toMatch(/само JPEG, PNG и WebP/);
    expect(await dirFiles()).toEqual([]);
  });
});

describe("uploadInstructorPhoto: valid flows", () => {
  beforeAll(() => as(adminCookie));

  it("stores a valid PNG under /uploads/<uuid>.png with the exact bytes and touches only photoUrl", async () => {
    const r = await uploadInstructorPhoto(P.id, photoForm(pngFile()));
    expect(r.ok).toMatch(/качена/);
    expect(r.photoUrl).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    const after = await row(P.id);
    expect(after.photoUrl).toBe(r.photoUrl);
    expect((await readFile(fileOf(r.photoUrl!))).equals(PNG)).toBe(true);
    // profile fields are not part of the photo action
    expect(after.name).toBe(P.name);
    expect(after.bio).toBe("Био по подразбиране.");
    expect(after.slug).toBe(P.slug);
    expect(after.archivedAt).toBeNull();
    expect(await dirFiles()).toEqual([path.basename(r.photoUrl!)]);
  });

  it("replace: the old LOCAL file is deleted when nothing else references it", async () => {
    const first = await uploadInstructorPhoto(P.id, photoForm(pngFile()));
    const second = await uploadInstructorPhoto(
      P.id,
      photoForm(new File([JPEG], "x.jpg", { type: "image/jpeg" }))
    );
    expect(second.ok).toBeTruthy();
    expect(second.photoUrl).not.toBe(first.photoUrl);
    expect(await exists(fileOf(first.photoUrl!))).toBe(false); // old file removed
    expect(await exists(fileOf(second.photoUrl!))).toBe(true); // new file kept
    expect((await row(P.id)).photoUrl).toBe(second.photoUrl);
    // cleanup for the next test
    await removeInstructorPhoto(P.id);
    expect(await dirFiles()).toEqual([]);
  });

  it("replace: a legacy EXTERNAL URL is never fetched or deleted; the new file is just stored", async () => {
    await db.update(instructors).set({ photoUrl: "/sports/legacy.jpg" }).where(eq(instructors.id, P.id));
    const r = await uploadInstructorPhoto(P.id, photoForm(pngFile()));
    expect(r.ok).toBeTruthy();
    expect((await row(P.id)).photoUrl).toBe(r.photoUrl);
    expect(await dirFiles()).toEqual([path.basename(r.photoUrl!)]); // only the new file
    await removeInstructorPhoto(P.id);
  });

  it("replace: a file still referenced by ANOTHER instructor is kept (conservative retention)", async () => {
    const first = await uploadInstructorPhoto(P.id, photoForm(pngFile()));
    // Simulate a second profile sharing the same file.
    await db.update(instructors).set({ photoUrl: first.photoUrl }).where(eq(instructors.id, O.id));
    const second = await uploadInstructorPhoto(
      P.id,
      photoForm(new File([JPEG], "x.jpg", { type: "image/jpeg" }))
    );
    expect(second.ok).toBeTruthy();
    expect(await exists(fileOf(first.photoUrl!))).toBe(true); // shared file kept
    expect((await row(O.id)).photoUrl).toBe(first.photoUrl); // the other row still serves it
    // cleanup: removing P's photo deletes only url2's file — url1 was orphaned
    // by the direct DB edit above (which bypasses the action's cleanup), so it
    // stays on disk: exactly the conservative retention under test.
    await db.update(instructors).set({ photoUrl: null }).where(eq(instructors.id, O.id));
    await removeInstructorPhoto(P.id);
    expect(await dirFiles()).toEqual([path.basename(first.photoUrl!)]);
    await rm(fileOf(first.photoUrl!), { force: true });
    expect(await dirFiles()).toEqual([]);
  });
});

describe("uploadInstructorPhoto: failure and edge states", () => {
  beforeAll(() => as(adminCookie));

  it("archived: refused, old DB value and old file stay, the freshly saved file is cleaned up", async () => {
    const kept = await uploadInstructorPhoto(P.id, photoForm(pngFile()));
    expect(kept.ok).toBeTruthy();
    await db.update(instructors).set({ archivedAt: new Date() }).where(eq(instructors.id, P.id));

    const r = await uploadInstructorPhoto(
      P.id,
      photoForm(new File([JPEG], "x.jpg", { type: "image/jpeg" }))
    );
    expect(r.error).toMatch(/архивиран/);
    expect((await row(P.id)).photoUrl).toBe(kept.photoUrl); // DB intact
    expect(await dirFiles()).toEqual([path.basename(kept.photoUrl!)]); // only the OLD file remains
    expect(await exists(fileOf(kept.photoUrl!))).toBe(true);

    expect((await removeInstructorPhoto(P.id)).error).toMatch(/архивиран/);
    expect((await row(P.id)).photoUrl).toBe(kept.photoUrl); // still intact
    expect(await exists(fileOf(kept.photoUrl!))).toBe(true);

    await db.update(instructors).set({ archivedAt: null }).where(eq(instructors.id, P.id));
    await removeInstructorPhoto(P.id);
    expect(await dirFiles()).toEqual([]);
  });

  it("unknown id: readable error and no file left behind", async () => {
    expect((await uploadInstructorPhoto(987654321, photoForm(pngFile()))).error).toMatch(
      /не съществува/
    );
    expect(await dirFiles()).toEqual([]);
  });

  it("invalid id: readable error", async () => {
    expect((await uploadInstructorPhoto(0, photoForm(pngFile()))).error).toMatch(/Невалиден/);
  });
});

describe("removeInstructorPhoto", () => {
  beforeAll(() => as(adminCookie));

  it("nulls the URL, deletes the unshared local file and keeps every profile field", async () => {
    const up = await uploadInstructorPhoto(P.id, photoForm(pngFile()));
    const r = await removeInstructorPhoto(P.id);
    expect(r.ok).toMatch(/премахната/);
    expect(r.photoUrl).toBeNull();
    const after = await row(P.id);
    expect(after.photoUrl).toBeNull();
    expect(after.name).toBe(P.name);
    expect(after.bio).toBe("Био по подразбиране.");
    expect(await exists(fileOf(up.photoUrl!))).toBe(false);
  });

  it("an external URL is nulled without any delete attempt (nothing to fetch)", async () => {
    await db
      .update(instructors)
      .set({ photoUrl: "https://legacy.example.com/photo.jpg" })
      .where(eq(instructors.id, P.id));
    const r = await removeInstructorPhoto(P.id);
    expect(r.ok).toBeTruthy();
    expect((await row(P.id)).photoUrl).toBeNull();
  });

  it("no photo: readable error", async () => {
    expect((await removeInstructorPhoto(P.id)).error).toMatch(/няма снимка/);
  });
});

describe("createInstructor with an optional photo", () => {
  beforeAll(() => as(adminCookie));

  it("creates the instructor with a validated photo file", async () => {
    const slug = `${tag}-with-photo`;
    const f = profileForm({ name: "С Фото", slug });
    f.set("photo", pngFile());
    const r = await createInstructor(f);
    expect(r.ok).toBeTruthy();
    const [created] = await db.select().from(instructors).where(eq(instructors.slug, slug));
    expect(created.photoUrl).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    expect((await readFile(fileOf(created.photoUrl!))).equals(PNG)).toBe(true);
    instructorIds.push(created.id);
    await removeInstructorPhoto(created.id); // file cleanup
  });

  it("a photoUrl STRING field is ignored (allowlist): without a file the row has no photo", async () => {
    const slug = `${tag}-no-photo`;
    const f = profileForm({ slug });
    f.set("photoUrl", "https://evil.example.com/x.png");
    const r = await createInstructor(f);
    expect(r.ok).toBeTruthy();
    const [created] = await db.select().from(instructors).where(eq(instructors.slug, slug));
    expect(created.photoUrl).toBeNull();
    instructorIds.push(created.id);
  });

  it("with BOTH a file and an evil photoUrl string, the uploaded file wins", async () => {
    const slug = `${tag}-both`;
    const f = profileForm({ slug });
    f.set("photo", pngFile());
    f.set("photoUrl", "https://evil.example.com/x.png");
    const r = await createInstructor(f);
    expect(r.ok).toBeTruthy();
    const [created] = await db.select().from(instructors).where(eq(instructors.slug, slug));
    expect(created.photoUrl).toMatch(/^\/uploads\//);
    expect(created.photoUrl).not.toContain("evil.example.com");
    instructorIds.push(created.id);
    await removeInstructorPhoto(created.id);
  });

  it("an invalid photo (MP4) refuses the whole create: no row, no file", async () => {
    const slug = `${tag}-mp4`;
    const f = profileForm({ slug });
    f.set("photo", new File([MP4], "v.mp4", { type: "video/mp4" }));
    const r = await createInstructor(f);
    expect(r.error).toMatch(/само JPEG, PNG и WebP/);
    const n = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(instructors)
      .where(eq(instructors.slug, slug));
    expect(n[0].n).toBe(0);
    expect(await dirFiles()).toEqual([]);
  });

  it("duplicate slug with a valid photo: readable error, nothing inserted, the saved file is cleaned up", async () => {
    const f = profileForm({ name: "Дубликат", slug: O.slug });
    f.set("photo", pngFile());
    const r = await createInstructor(f);
    expect(r.error).toMatch(/вече се използва/);
    const n = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(instructors)
      .where(eq(instructors.slug, O.slug));
    expect(n[0].n).toBe(1); // only the pre-existing row
    expect(await dirFiles()).toEqual([]); // the freshly written file was removed
  });
});

describe("photo interaction with profile edit and delete", () => {
  beforeAll(() => as(adminCookie));

  it("updateInstructor keeps the uploaded photoUrl (no mass assignment)", async () => {
    const up = await uploadInstructorPhoto(P.id, photoForm(pngFile()));
    const r = await updateInstructor(
      P.id,
      profileForm({ name: "Ново Име", slug: P.slug, bio: "Ново био." })
    );
    expect(r.ok).toBeTruthy();
    const after = await row(P.id);
    expect(after.name).toBe("Ново Име");
    expect(after.bio).toBe("Ново био.");
    expect(after.photoUrl).toBe(up.photoUrl); // preserved, never from the form
  });

  it("deleteInstructor also removes the now-unreferenced photo file", async () => {
    const slug = `${tag}-del-photo`;
    const f = profileForm({ name: "За Изтриване", slug });
    f.set("photo", pngFile());
    expect((await createInstructor(f)).ok).toBeTruthy();
    const [created] = await db.select().from(instructors).where(eq(instructors.slug, slug));
    expect(created.photoUrl).toMatch(/^\/uploads\//);
    const r = await deleteInstructor(created.id);
    expect(r.ok).toMatch(/изтрит/);
    expect(await exists(fileOf(created.photoUrl!))).toBe(false); // file gone with the row
  });
});
