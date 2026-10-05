import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { galleryItems, instructors } from "../src/db/schema";
import {
  detectMediaType,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  saveUpload,
} from "../src/lib/storage";

// One-time migration of media from Cloudflare R2 to the local disk (UPLOAD_DIR).
// Finds every absolute http(s) URL in the media columns, downloads it over plain
// HTTPS, validates it exactly like an interactive upload would (magic bytes +
// size caps) and rewrites the URL to /uploads/<key>.
//
// Idempotent: rows already pointing at /uploads/ are skipped. Dry-run by default;
// pass --apply to write files and update the database.

const ABSOLUTE_URL_RE = /^https?:\/\//i;

export type MigrationSummary = {
  scanned: number;
  migrated: number;
  skippedLocal: number;
  failed: number;
};

function validate(buffer: Buffer): string {
  const type = detectMediaType(buffer);
  if (!type) {
    throw new Error("не е JPEG/PNG/WebP/MP4 (проверка по magic bytes)");
  }
  const max = type === "video/mp4" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (buffer.length > max) {
    throw new Error(`твърде голям файл (${buffer.length} байта, максимум ${max})`);
  }
  return type;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function migrateR2ToLocal(opts: {
  apply: boolean;
  log?: (msg: string) => void;
}): Promise<MigrationSummary> {
  const log = opts.log ?? ((msg: string) => console.log(msg));
  const db = getDb();
  const summary: MigrationSummary = {
    scanned: 0,
    migrated: 0,
    skippedLocal: 0,
    failed: 0,
  };

  async function migrateRow(
    table: "gallery_items" | "instructors",
    id: number,
    url: string | null,
    update: (newUrl: string) => Promise<void>
  ) {
    summary.scanned++;
    if (!url || !ABSOLUTE_URL_RE.test(url)) {
      summary.skippedLocal++;
      return;
    }
    try {
      const buffer = await download(url);
      const type = validate(buffer);
      if (!opts.apply) {
        log(`[dry-run] ${table} ${id}: ${url} -> /uploads/<нов> (${type})`);
        summary.migrated++;
        return;
      }
      const { url: newUrl } = await saveUpload(buffer);
      await update(newUrl);
      log(`${table} ${id}: ${url} -> ${newUrl}`);
      summary.migrated++;
    } catch (err) {
      summary.failed++;
      log(`FAILED ${table} ${id} (${url}): ${(err as Error).message}`);
    }
  }

  const gallery = await db
    .select({ id: galleryItems.id, url: galleryItems.url })
    .from(galleryItems);
  for (const item of gallery) {
    await migrateRow("gallery_items", item.id, item.url, async (newUrl) => {
      await db.update(galleryItems).set({ url: newUrl }).where(eq(galleryItems.id, item.id));
    });
  }

  const people = await db
    .select({ id: instructors.id, photoUrl: instructors.photoUrl })
    .from(instructors);
  for (const person of people) {
    await migrateRow("instructors", person.id, person.photoUrl, async (newUrl) => {
      await db.update(instructors).set({ photoUrl: newUrl }).where(eq(instructors.id, person.id));
    });
  }

  log(
    opts.apply
      ? `Готово: ${summary.migrated} мигрирани, ${summary.failed} грешки, ${summary.skippedLocal} пропуск (вече локални).`
      : `Преглед (нищо не е записано): ${summary.migrated} биха мигрирали, ${summary.failed} грешки, ${summary.skippedLocal} пропуск (вече локални). Пусни с --apply за запис.`
  );
  return summary;
}

const isMain = (() => {
  try {
    return process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const apply = process.argv.includes("--apply");
  migrateR2ToLocal({ apply }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
