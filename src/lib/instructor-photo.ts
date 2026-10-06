import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { instructors } from "@/db/schema";
import {
  deleteFromStorage,
  detectMediaType,
  MAX_IMAGE_BYTES,
  saveUpload,
  UPLOAD_URL_PREFIX,
} from "./storage";

// Instructor photo upload/remove. The profile create/edit allowlist
// (instructor-profile.ts) never accepts a photoUrl STRING: the only way in is
// this module, which stores server-validated bytes under a fresh UUID key.

export type SetPhotoResult =
  | { ok: true; slug: string; oldUrl: string | null; newUrl: string }
  | { ok: false; reason: "not_found" | "archived" };

type SetPhotoTxResult =
  | { ok: true; slug: string; oldUrl: string | null }
  | { ok: false; reason: "not_found" | "archived" };

export type ClearPhotoResult =
  | { ok: true; slug: string; oldUrl: string }
  | { ok: false; reason: "not_found" | "archived" | "no_photo" };

// Reads the "photo" entry and validates the ACTUAL bytes: image magic bytes
// only (JPEG/PNG/WebP — an MP4 is refused explicitly), non-empty, at most
// MAX_IMAGE_BYTES. The client-supplied type/extension are ignored entirely.
export async function readValidatedPhoto(formData: FormData): Promise<Buffer> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Избери снимка (JPEG, PNG или WebP до 8 MB).");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = detectMediaType(buffer);
  if (!type || type === "video/mp4") {
    throw new Error("Позволени са само JPEG, PNG и WebP снимки (до 8 MB).");
  }
  // Authoritative size check on the real bytes, not on the declared size.
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Снимката е до 8 MB.");
  }
  return buffer;
}

// Saves the validated bytes, then flips photo_url in ONE transaction on the
// locked instructor row, requiring it to still be active — an archive/delete
// that commits while we wait makes the update refuse (same READ COMMITTED
// re-check as lockActiveInstructor in admin/actions.ts). If the DB refuses or
// throws, ONLY the freshly written file is deleted: the old DB value and the
// old file are never touched on failure.
export async function setInstructorPhoto(
  instructorId: number,
  buffer: Buffer
): Promise<SetPhotoResult> {
  const { url: newUrl } = await saveUpload(buffer);
  let result: SetPhotoTxResult;
  try {
    result = await getDb().transaction(async (tx): Promise<SetPhotoTxResult> => {
      const [ins] = await tx
        .select({ slug: instructors.slug, photoUrl: instructors.photoUrl, archivedAt: instructors.archivedAt })
        .from(instructors)
        .where(eq(instructors.id, instructorId))
        .for("update");
      if (!ins) return { ok: false as const, reason: "not_found" as const };
      if (ins.archivedAt) return { ok: false as const, reason: "archived" as const };
      await tx
        .update(instructors)
        .set({ photoUrl: newUrl })
        .where(eq(instructors.id, instructorId));
      return { ok: true as const, slug: ins.slug, oldUrl: ins.photoUrl };
    });
  } catch (err) {
    await deleteFromStorage(newUrl);
    throw err;
  }
  if (!result.ok) {
    await deleteFromStorage(newUrl);
    return result;
  }
  return { ...result, newUrl };
}

// Nulls photo_url under the same locked + active-only rules.
export async function clearInstructorPhoto(
  instructorId: number
): Promise<ClearPhotoResult> {
  return getDb().transaction(async (tx) => {
    const [ins] = await tx
      .select({ slug: instructors.slug, photoUrl: instructors.photoUrl, archivedAt: instructors.archivedAt })
      .from(instructors)
      .where(eq(instructors.id, instructorId))
      .for("update");
    if (!ins) return { ok: false as const, reason: "not_found" as const };
    if (ins.archivedAt) return { ok: false as const, reason: "archived" as const };
    if (!ins.photoUrl) return { ok: false as const, reason: "no_photo" as const };
    await tx
      .update(instructors)
      .set({ photoUrl: null })
      .where(eq(instructors.id, instructorId));
    return { ok: true as const, slug: ins.slug, oldUrl: ins.photoUrl };
  });
}

// Deletes a replaced/removed photo file only when BOTH hold:
// 1. it is one of OUR local uploads (/uploads/<uuid>.<ext>) — an external or
//    legacy URL (https://..., /sports/...) is never fetched and never deleted;
// 2. no instructor row still points at it — by call time the owner row already
//    carries the new value (or NULL), so any match is another profile sharing
//    the file: it is kept (an orphan beats a broken profile; gallery items
//    always have their own UUID keys, so they cannot collide with these).
// A failed unlink is logged, not thrown: the DB is already updated and an
// orphaned file is preferable to a failed user-visible operation.
export async function deleteReplacedPhoto(oldUrl: string | null): Promise<void> {
  if (!oldUrl || !oldUrl.startsWith(UPLOAD_URL_PREFIX)) return;
  try {
    const sharers = await getDb()
      .select({ id: instructors.id })
      .from(instructors)
      .where(eq(instructors.photoUrl, oldUrl));
    if (sharers.length > 0) return;
    await deleteFromStorage(oldUrl);
  } catch (err) {
    console.warn("deleteReplacedPhoto: keeping the file after a failed cleanup:", err);
  }
}
