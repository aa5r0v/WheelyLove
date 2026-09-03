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

export async function uploadToStorage(
  file: File
): Promise<{ url: string }> {
  const key = `gallery/${Date.now()}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
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
