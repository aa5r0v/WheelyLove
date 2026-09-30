import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  detectMediaType,
  saveUpload,
  deleteFromStorage,
  resolveUploadPath,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "./storage";

const enc = (s: string) => new TextEncoder().encode(s);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(8)]);

describe("detectMediaType", () => {
  it("detects JPEG, PNG, WebP and MP4 by magic bytes", () => {
    expect(detectMediaType(JPEG)).toBe("image/jpeg");
    expect(
      detectMediaType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))
    ).toBe("image/png");
    expect(detectMediaType(enc("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(detectMediaType(MP4)).toBe("video/mp4");
  });
  it("rejects everything else (html, svg, gif, empty)", () => {
    expect(detectMediaType(enc("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectMediaType(enc("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectMediaType(enc("GIF89a...."))).toBeNull();
    expect(detectMediaType(new Uint8Array())).toBeNull();
  });
});

describe("local storage", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "wl-uploads-"));
    process.env.UPLOAD_DIR = dir;
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes a UUID-named file with the detected extension and leaves no temp files", async () => {
    const { url, type } = await saveUpload(JPEG);
    expect(type).toBe("image/jpeg");
    expect(url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.jpg$/);
    const onDisk = await readFile(path.join(dir, path.basename(url)));
    expect(onDisk.equals(JPEG)).toBe(true);
    expect((await readdir(dir)).filter((f) => f.startsWith(".tmp-"))).toHaveLength(0);
  });

  it("enforces per-type size caps and rejects unknown types", async () => {
    await expect(saveUpload(Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES)]))).rejects.toThrow(/голям/);
    await expect(saveUpload(Buffer.from("<html>"))).rejects.toThrow(/Позволени/);
    const bigMp4 = Buffer.concat([MP4, Buffer.alloc(MAX_VIDEO_BYTES)]);
    await expect(saveUpload(bigMp4)).rejects.toThrow(/голям/);
    // an mp4 between the image and video caps is fine
    const { url } = await saveUpload(Buffer.concat([MP4, Buffer.alloc(MAX_IMAGE_BYTES + 1)]));
    expect(url.endsWith(".mp4")).toBe(true);
  });

  it("deletes only files inside UPLOAD_DIR", async () => {
    const { url } = await saveUpload(JPEG);
    await deleteFromStorage(url);
    await expect(stat(path.join(dir, path.basename(url)))).rejects.toThrow();
    await deleteFromStorage(url); // already gone: no error

    for (const evil of [
      "/uploads/../../etc/passwd",
      "/uploads/..%2f..%2fetc%2fpasswd",
      "/uploads/a.jpg",
      "https://x.r2.dev/gallery/1.jpg",
      "/etc/passwd",
    ]) {
      expect(resolveUploadPath(evil)).toBeNull();
    }
  });
});
