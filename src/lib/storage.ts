import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

function getClient() {
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AllowedImageType = keyof typeof IMAGE_TYPES;

// Detects the real type from the file's magic numbers; the client-supplied type is ignored.
export function detectImageType(buf: Uint8Array): AllowedImageType | null {
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
  return null;
}

export async function uploadToStorage(
  file: File
): Promise<{ url: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Файлът е твърде голям (максимум 8 MB).");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("Файлът е твърде голям (максимум 8 MB).");
  }
  const contentType = detectImageType(buffer);
  if (!contentType) {
    throw new Error("Позволени са само JPEG, PNG и WebP изображения.");
  }

  const key = `gallery/${randomUUID()}.${IMAGE_TYPES[contentType]}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const publicBase = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");
  return { url: `${publicBase}/${key}` };
}

export async function deleteFromStorage(url: string): Promise<void> {
  const publicBase = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");
  const key = url.startsWith(publicBase)
    ? url.slice(publicBase.length + 1)
    : url;

  await getClient().send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
    })
  );
}
