import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, unlink } from "node:fs/promises";
import path from "node:path";

// Files live on local disk (bind mount on the VPS) and are served by nginx at /uploads/<key>.
export const UPLOAD_URL_PREFIX = "/uploads/";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const MEDIA_TYPES = {
  "image/jpeg": { ext: "jpg", maxBytes: MAX_IMAGE_BYTES },
  "image/png": { ext: "png", maxBytes: MAX_IMAGE_BYTES },
  "image/webp": { ext: "webp", maxBytes: MAX_IMAGE_BYTES },
  "video/mp4": { ext: "mp4", maxBytes: MAX_VIDEO_BYTES },
} as const;

export type AllowedMediaType = keyof typeof MEDIA_TYPES;

// Keys we generate ourselves: random UUID + allowlisted extension. Nothing else is ever read or deleted.
const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|mp4)$/;

export function getUploadDir() {
  return path.resolve(process.env.UPLOAD_DIR || "/data/uploads");
}

// Detects the real type from the file's magic numbers; the client-supplied type is ignored.
export function detectMediaType(buf: Uint8Array): AllowedMediaType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => buf[i] === v)
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    String.fromCharCode(...buf.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...buf.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  // ISO base media file: box size (4 bytes) followed by "ftyp".
  if (buf.length >= 12 && String.fromCharCode(...buf.subarray(4, 8)) === "ftyp") {
    return "video/mp4";
  }
  return null;
}

// Validates the bytes (real type + per-type size cap) and writes them atomically
// (temp file in the same directory, then rename). Returns the public URL.
export async function saveUpload(buffer: Buffer): Promise<{ url: string; type: AllowedMediaType }> {
  const type = detectMediaType(buffer);
  if (!type) {
    throw new Error("Позволени са само JPEG, PNG, WebP изображения и MP4 видео.");
  }
  const { ext, maxBytes } = MEDIA_TYPES[type];
  if (buffer.length > maxBytes) {
    throw new Error(
      `Файлът е твърде голям (максимум ${maxBytes / 1024 / 1024} MB за ${type.startsWith("video") ? "видео" : "снимка"}).`
    );
  }

  const dir = getUploadDir();
  await mkdir(dir, { recursive: true, mode: 0o755 });

  const key = `${randomUUID()}.${ext}`;
  const finalPath = path.join(dir, key);
  const tmpPath = path.join(dir, `.tmp-${randomUUID()}`);

  try {
    const fh = await open(tmpPath, "wx", 0o644);
    try {
      await fh.writeFile(buffer);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmpPath, finalPath);
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }

  return { url: `${UPLOAD_URL_PREFIX}${key}`, type };
}

export async function uploadToStorage(
  file: File
): Promise<{ url: string; type: AllowedMediaType }> {
  // Cheap early reject before reading the body into memory.
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("Файлът е твърде голям.");
  }
  return saveUpload(Buffer.from(await file.arrayBuffer()));
}

// Resolves a stored URL to a path inside UPLOAD_DIR, or null if it is not one of ours.
export function resolveUploadPath(url: string): string | null {
  if (!url.startsWith(UPLOAD_URL_PREFIX)) return null;
  const key = url.slice(UPLOAD_URL_PREFIX.length);
  if (!KEY_RE.test(key)) return null;
  const dir = getUploadDir();
  const resolved = path.resolve(dir, key);
  if (!resolved.startsWith(dir + path.sep)) return null;
  return resolved;
}

export async function deleteFromStorage(url: string): Promise<void> {
  const target = resolveUploadPath(url);
  if (!target) {
    console.warn("deleteFromStorage: not a local upload URL, nothing deleted:", url);
    return;
  }
  try {
    await unlink(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
