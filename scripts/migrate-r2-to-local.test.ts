import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { galleryItems, instructors } from "../src/db/schema";
import { migrateR2ToLocal } from "./migrate-r2-to-local";

// Downloads are mocked: the "remote" R2 objects never exist.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const HTML = Buffer.from("<html><body>not an image</body></html>");
const fetchMock = vi.fn(async (url: string | URL | Request) =>
  String(url).includes("/bad/")
    ? new Response(HTML)
    : new Response(JPEG)
);

let dir: string;
let galleryId: number;
let instructorId: number;
let badId: number;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "wl-r2mig-"));
  process.env.UPLOAD_DIR = dir;
  vi.stubGlobal("fetch", fetchMock);

  const db = getDb();
  const [g] = await db
    .insert(galleryItems)
    .values({ type: "image", url: "https://pub-x.r2.dev/gallery/old.jpg", caption: "" })
    .returning();
  galleryId = g.id;
  const [bad] = await db
    .insert(galleryItems)
    .values({ type: "image", url: "https://pub-x.r2.dev/bad/not-image.jpg", caption: "" })
    .returning();
  badId = bad.id;
  const [i] = await db
    .insert(instructors)
    .values({
      slug: `r2mig-${Date.now()}`,
      name: "R2Mig",
      photoUrl: "https://pub-x.r2.dev/instructors/face.jpg",
    })
    .returning();
  instructorId = i.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(galleryItems).where(eq(galleryItems.id, galleryId));
  await db.delete(galleryItems).where(eq(galleryItems.id, badId));
  await db.delete(instructors).where(eq(instructors.id, instructorId));
  await rm(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("migrateR2ToLocal", () => {
  it("dry-run changes nothing in the database", async () => {
    const db = getDb();
    const before = await db.select().from(galleryItems).where(eq(galleryItems.id, galleryId));
    const callsBefore = fetchMock.mock.calls.length;

    const summary = await migrateR2ToLocal({ apply: false, log: () => {} });

    const after = await db.select().from(galleryItems).where(eq(galleryItems.id, galleryId));
    expect(after[0].url).toBe(before[0].url);
    expect(summary.migrated).toBeGreaterThanOrEqual(1);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("--apply downloads, stores locally and rewrites the URL", async () => {
    const db = getDb();
    const summary = await migrateR2ToLocal({ apply: true, log: () => {} });

    const [g] = await db.select().from(galleryItems).where(eq(galleryItems.id, galleryId));
    expect(g.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.jpg$/);
    const onDisk = await readFile(path.join(dir, path.basename(g.url)));
    expect(onDisk.equals(JPEG)).toBe(true);

    const [person] = await db.select().from(instructors).where(eq(instructors.id, instructorId));
    expect(person.photoUrl).toMatch(/^\/uploads\/[0-9a-f-]{36}\.jpg$/);

    // The HTML "download" fails validation and keeps its old URL.
    const [bad] = await db.select().from(galleryItems).where(eq(galleryItems.id, badId));
    expect(bad.url).toBe("https://pub-x.r2.dev/bad/not-image.jpg");
    expect(summary.failed).toBe(1);
  });

  it("is idempotent: already-local URLs are skipped without fetching", async () => {
    const db = getDb();
    const [before] = await db.select().from(galleryItems).where(eq(galleryItems.id, galleryId));
    const callsBefore = fetchMock.mock.calls.length;

    const summary = await migrateR2ToLocal({ apply: true, log: () => {} });

    const [after] = await db.select().from(galleryItems).where(eq(galleryItems.id, galleryId));
    expect(after.url).toBe(before.url);
    expect(summary.migrated).toBe(0);
    expect(fetchMock.mock.calls.length).toBe(callsBefore + 1); // only the bad URL, which is still remote
  });
});
