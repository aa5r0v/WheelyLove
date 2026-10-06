"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import {
  bookings,
  classSessions,
  galleryItems,
  instructors,
  sessionTemplates,
  sports,
} from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { uploadToStorage, saveUpload, deleteFromStorage } from "@/lib/storage";
import { cancelBookingAndNotify } from "@/lib/bookings";
import { notifyWaitlist } from "@/lib/waitlist";
import { fromSofiaDateTime } from "@/lib/format";
import {
  parseInstructorProfile,
  isSafeId,
  type InstructorProfileErrors,
} from "@/lib/instructor-profile";
import {
  clearInstructorPhoto,
  deleteReplacedPhoto,
  readValidatedPhoto,
  setInstructorPhoto,
} from "@/lib/instructor-photo";
import {
  archiveInstructorRow,
  deleteInstructorRow,
  restoreInstructorRow,
} from "@/lib/instructor-lifecycle";
import {
  parseLevel,
  parseOptionalEuroToCents,
  parseOptionalInt,
  parseTemplateForm,
} from "@/lib/trainings";
import { generateSessions } from "@/lib/schedule-generator";
import { linkInstructorAccount, unlinkInstructorAccount } from "@/lib/instructor-link";
import { revalidateLocalized } from "@/lib/revalidate";

async function assertAdmin() {
  if (!(await isAdmin())) {
    throw new Error("Нямаш права за администратор.");
  }
}

// New classes/templates may only be created for an instructor who is not
// archived. Server-side on purpose: hiding archived options in a <select> is
// not enforcement.
//
// Locks the instructor row FOR UPDATE and requires it to still be active.
// Under READ COMMITTED the predicate is re-checked against the latest
// committed row version after any lock wait, so an archive that commits while
// we wait makes this return false. Must run INSIDE the same transaction as
// the dependent insert/update; an archive that instead waits for our lock
// preserves the written rows (see instructor-lifecycle.ts).
const INSTRUCTOR_UNAVAILABLE =
  "Този инструктор не е наличен (архивиран или изтрит). Избери друг.";

async function lockActiveInstructor(tx: DbOrTx, instructorId: number) {
  const [ins] = await tx
    .select({ id: instructors.id })
    .from(instructors)
    .where(and(eq(instructors.id, instructorId), isNull(instructors.archivedAt)))
    .for("update");
  return ins !== undefined;
}

export async function createSession(formData: FormData) {
  await assertAdmin();
  const db = getDb();

  const sportId = Number(formData.get("sportId"));
  const instructorId = Number(formData.get("instructorId"));
  if (!Number.isSafeInteger(instructorId) || instructorId <= 0) {
    throw new Error("Избери инструктор.");
  }
  const date = String(formData.get("date") ?? "");
  const startTimeStr = String(formData.get("startTime") ?? "");
  const endTimeStr = String(formData.get("endTime") ?? "");
  const capacity = Number(formData.get("capacity"));
  const priceEuro = Number(formData.get("price"));
  const repeatWeeks = Math.max(1, Number(formData.get("repeatWeeks") || 1));

  const rows = Array.from({ length: repeatWeeks }, (_, i) => {
    return {
      sportId,
      instructorId,
      startTime: fromSofiaDateTime(date, startTimeStr, i * 7),
      endTime: fromSofiaDateTime(date, endTimeStr, i * 7),
      capacity,
      priceCents: Math.round(priceEuro * 100),
    };
  });

  // The active check and the insert share one transaction on the locked
  // instructor row, so an archive can no longer slip between them.
  await db.transaction(async (tx) => {
    if (!(await lockActiveInstructor(tx, instructorId))) {
      throw new Error(INSTRUCTOR_UNAVAILABLE);
    }
    await tx.insert(classSessions).values(rows);
  });

  revalidatePath("/admin/sessions");
  revalidateLocalized("/");
  revalidateLocalized("/schedule");
}

export async function updateSession(sessionId: number, formData: FormData) {
  await assertAdmin();
  const db = getDb();

  const [existing] = await db
    .select({ bookedCount: classSessions.bookedCount })
    .from(classSessions)
    .where(eq(classSessions.id, sessionId));
  if (!existing) throw new Error("Часът не съществува.");

  const sportId = Number(formData.get("sportId"));
  const instructorId = Number(formData.get("instructorId"));
  if (!Number.isSafeInteger(instructorId) || instructorId <= 0) {
    throw new Error("Избери инструктор.");
  }
  const date = String(formData.get("date") ?? "");
  const startTimeStr = String(formData.get("startTime") ?? "");
  const endTimeStr = String(formData.get("endTime") ?? "");
  const capacity = Number(formData.get("capacity"));
  const priceEuro = Number(formData.get("price"));

  if (capacity < existing.bookedCount) {
    throw new Error(
      `Капацитетът не може да е под броя вече записани (${existing.bookedCount}).`
    );
  }

  // The instructor check and the update share one transaction. The session's
  // current instructor is re-read inside it: an UNCHANGED session may keep its
  // (possibly archived) instructor — existing classes are preserved — while a
  // reassignment must lock an active instructor. The conditional update
  // (instructor_id unchanged since the read) refuses a silent overwrite when a
  // concurrent edit reassigned the session in between.
  await db.transaction(async (tx) => {
    const [fresh] = await tx
      .select({ instructorId: classSessions.instructorId })
      .from(classSessions)
      .where(eq(classSessions.id, sessionId));
    if (!fresh) throw new Error("Часът не съществува.");
    if (
      instructorId !== fresh.instructorId &&
      !(await lockActiveInstructor(tx, instructorId))
    ) {
      throw new Error(INSTRUCTOR_UNAVAILABLE);
    }
    const updated = await tx
      .update(classSessions)
      .set({
        sportId,
        instructorId,
        startTime: fromSofiaDateTime(date, startTimeStr),
        endTime: fromSofiaDateTime(date, endTimeStr),
        capacity,
        priceCents: Math.round(priceEuro * 100),
      })
      .where(
        and(
          eq(classSessions.id, sessionId),
          eq(classSessions.instructorId, fresh.instructorId)
        )
      )
      .returning({ id: classSessions.id });
    if (updated.length === 0) {
      throw new Error("Часът беше променен от друг администратор. Опитай отново.");
    }
  });

  try {
    await notifyWaitlist(sessionId);
  } catch (err) {
    console.error("Failed to notify waitlist:", err);
  }

  revalidatePath("/admin/sessions");
  revalidateLocalized("/");
  revalidateLocalized("/schedule");
}

export async function cancelSession(sessionId: number) {
  await assertAdmin();
  const db = getDb();

  // Mark cancelled first so releasing each booking's spot doesn't email the waitlist.
  await db
    .update(classSessions)
    .set({ cancelledAt: new Date() })
    .where(eq(classSessions.id, sessionId));

  const activeBookings = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.sessionId, sessionId),
        inArray(bookings.status, ["confirmed", "pending"])
      )
    );

  for (const b of activeBookings) {
    await cancelBookingAndNotify(b.id, "session");
  }

  revalidatePath("/admin/sessions");
  revalidateLocalized("/");
  revalidateLocalized("/schedule");
}

export async function cancelBooking(bookingId: number) {
  await assertAdmin();
  await cancelBookingAndNotify(bookingId);
  revalidatePath("/admin/bookings");
}

// Marks a pay-on-site booking as paid. The customer already got a confirmation when booking,
// so this is an internal note for the studio and sends nothing.
export async function confirmCashBooking(bookingId: number) {
  await assertAdmin();
  const db = getDb();

  await db
    .update(bookings)
    .set({ status: "confirmed" })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending")));

  revalidatePath("/admin/bookings");
}

export async function createSport(formData: FormData) {
  await assertAdmin();
  const db = getDb();
  await db.insert(sports).values({
    slug: String(formData.get("slug")),
    name: String(formData.get("name")),
    color: String(formData.get("color") || "#6366f1"),
    description: String(formData.get("description") ?? ""),
    level: parseLevel(formData.get("level")),
    defaultDurationMin: parseOptionalInt(formData.get("defaultDurationMin")),
    defaultPriceCents: parseOptionalEuroToCents(formData.get("defaultPrice")),
    defaultCapacity: parseOptionalInt(formData.get("defaultCapacity")) ?? 12,
  });
  revalidatePath("/admin/sports");
  revalidatePath("/");
}

export async function updateSport(sportId: number, formData: FormData) {
  await assertAdmin();
  const db = getDb();
  await db
    .update(sports)
    .set({
      name: String(formData.get("name")),
      color: String(formData.get("color") || "#6366f1"),
      description: String(formData.get("description") ?? ""),
      level: parseLevel(formData.get("level")),
      defaultDurationMin: parseOptionalInt(formData.get("defaultDurationMin")),
      defaultPriceCents: parseOptionalEuroToCents(formData.get("defaultPrice")),
      defaultCapacity: parseOptionalInt(formData.get("defaultCapacity")) ?? 12,
    })
    .where(eq(sports.id, sportId));
  revalidatePath("/admin/sports");
  revalidatePath("/");
}

// ----------------------------------------------------- instructors (admin CRUD)

export type InstructorFormState = {
  errors?: InstructorProfileErrors;
  error?: string;
  ok?: string;
};

export type InstructorActionState = { error?: string; ok?: string };

// Photo ops return the resulting photoUrl so the client can show the new
// photo immediately (the page revalidation refreshes the row right after).
export type InstructorPhotoState = {
  error?: string;
  ok?: string;
  photoUrl?: string | null;
};

// Dedicated photo actions: the profile allowlist never touches photoUrl, so
// upload/replace/remove go through here. assertAdmin() runs BEFORE the file
// is read; the bytes are then validated (real type, max 8 MB) in
// readValidatedPhoto and the row update is atomic against archive/delete
// races (see instructor-photo.ts).
export async function uploadInstructorPhoto(
  instructorId: number,
  formData: FormData
): Promise<InstructorPhotoState> {
  await assertAdmin();
  if (!isSafeId(instructorId)) return { error: "Невалиден инструктор." };

  let buffer: Buffer;
  try {
    buffer = await readValidatedPhoto(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Невалидна снимка." };
  }

  const r = await setInstructorPhoto(instructorId, buffer);
  if (!r.ok) {
    if (r.reason === "not_found") return { error: "Инструкторът не съществува." };
    return {
      error: "Инструкторът е архивиран. Първо го възстанови, за да променяш снимката.",
    };
  }
  await deleteReplacedPhoto(r.oldUrl);
  revalidateInstructorPaths(r.slug);
  return { ok: "Снимката е качена.", photoUrl: r.newUrl };
}

export async function removeInstructorPhoto(
  instructorId: number
): Promise<InstructorPhotoState> {
  await assertAdmin();
  if (!isSafeId(instructorId)) return { error: "Невалиден инструктор." };

  const r = await clearInstructorPhoto(instructorId);
  if (!r.ok) {
    if (r.reason === "not_found") return { error: "Инструкторът не съществува." };
    if (r.reason === "no_photo") return { error: "Този инструктор няма снимка." };
    return {
      error: "Инструкторът е архивиран. Първо го възстанови, за да променяш снимката.",
    };
  }
  await deleteReplacedPhoto(r.oldUrl);
  revalidateInstructorPaths(r.slug);
  return { ok: "Снимката е премахната.", photoUrl: null };
}

// All admin pages are BG-only today; /en/* only mirrors the public pages.
function revalidateInstructorPaths(...slugs: (string | undefined)[]) {
  revalidatePath("/admin/instructors");
  revalidateLocalized("/instructors");
  revalidateLocalized("/");
  revalidateLocalized("/schedule");
  for (const slug of slugs) if (slug) revalidateLocalized(`/instructors/${slug}`);
}

// A unique slug readable in the UI instead of a raw DB error. Two layers: an
// explicit check (nice message) and the unique-index race (still readable).
async function duplicateSlugError(slug: string, exceptInstructorId?: number) {
  const rows = await getDb()
    .select({ id: instructors.id })
    .from(instructors)
    .where(
      exceptInstructorId
        ? and(eq(instructors.slug, slug), ne(instructors.id, exceptInstructorId))
        : eq(instructors.slug, slug)
    );
  return rows.length > 0 ? "Този slug вече се използва от друг инструктор." : undefined;
}

function isUniqueViolation(e: unknown) {
  return (e as { code?: string }).code === "23505";
}

// Called directly from the client (inside a transition), never via
// useActionState: the form keeps the submitted values on a refused save, so
// there is no useActionState form reset to fight.
export async function createInstructor(
  formData: FormData
): Promise<InstructorFormState> {
  await assertAdmin();
  const { values, errors } = parseInstructorProfile(formData);
  if (Object.keys(errors).length > 0) return { errors };
  const duplicate = await duplicateSlugError(values.slug);
  if (duplicate) return { errors: { slug: duplicate }, error: duplicate };

  // Optional photo: validated from the real bytes and stored under our own
  // UUID key. A "photoUrl" STRING field is not and cannot be part of this —
  // values comes from the allowlist in parseInstructorProfile only. (An empty
  // file input serializes as a zero-size File entry — that means "no photo".)
  let photoBuffer: Buffer | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    try {
      photoBuffer = await readValidatedPhoto(formData);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Невалидна снимка." };
    }
  }
  let savedUrl: string | null = null;
  try {
    if (photoBuffer) savedUrl = (await saveUpload(photoBuffer)).url;
    await getDb().insert(instructors).values(
      savedUrl ? { ...values, photoUrl: savedUrl } : values
    );
  } catch (e) {
    // The insert failed: the just-written file (if any) is ours and fresh —
    // remove it, nothing else can reference it yet.
    if (savedUrl) await deleteFromStorage(savedUrl);
    if (isUniqueViolation(e))
      return {
        errors: { slug: "Този slug вече се използва от друг инструктор." },
        error: "Този slug вече се използва от друг инструктор.",
      };
    throw e;
  }
  revalidateInstructorPaths(values.slug);
  return { ok: `Инструкторът „${values.name}“ е добавен.` };
}

// Edits the public profile fields only. photoUrl, userId, role and archived_at
// are never taken from the form (no mass assignment).
export async function updateInstructor(
  instructorId: number,
  formData: FormData
): Promise<InstructorFormState> {
  await assertAdmin();
  if (!isSafeId(instructorId)) return { error: "Невалиден инструктор." };

  const db = getDb();
  const [current] = await db
    .select({ slug: instructors.slug, archivedAt: instructors.archivedAt })
    .from(instructors)
    .where(eq(instructors.id, instructorId));
  if (!current) return { error: "Инструкторът не съществува." };
  if (current.archivedAt)
    return { error: "Инструкторът е архивиран. Първо го възстанови, за да го редактираш." };

  const { values, errors } = parseInstructorProfile(formData);
  if (Object.keys(errors).length > 0) return { errors };
  const duplicate = await duplicateSlugError(values.slug, instructorId);
  if (duplicate) return { errors: { slug: duplicate }, error: duplicate };

  try {
    await db.update(instructors).set(values).where(eq(instructors.id, instructorId));
  } catch (e) {
    if (isUniqueViolation(e))
      return {
        errors: { slug: "Този slug вече се използва от друг инструктор." },
        error: "Този slug вече се използва от друг инструктор.",
      };
    throw e;
  }
  revalidateInstructorPaths(current.slug, values.slug);
  return { ok: "Профилът е запазен." };
}

// Permanent delete. Refused with a readable message while any class or
// template references the instructor — archiving is the safe path then.
export async function deleteInstructor(
  instructorId: number
): Promise<InstructorActionState> {
  await assertAdmin();
  if (!isSafeId(instructorId)) return { error: "Невалиден инструктор." };

  const r = await deleteInstructorRow(instructorId);
  if (!r.ok) {
    if (r.reason === "not_found") return { error: "Инструкторът не съществува." };
    return {
      error: `Инструкторът не може да бъде изтрит: има създадени часове (${r.sessions}) и/или шаблони (${r.templates}). Архивирай го вместо това — часовете и резервациите остават.`,
    };
  }
  // The URL and slug came from the locked row inside the delete transaction,
  // so a concurrent photo replacement cannot leave its new file orphaned.
  await deleteReplacedPhoto(r.photoUrl);
  revalidateInstructorPaths(r.slug);
  return { ok: "Инструкторът е изтрит окончателно." };
}

export async function archiveInstructor(
  instructorId: number
): Promise<InstructorActionState> {
  await assertAdmin();
  if (!isSafeId(instructorId)) return { error: "Невалиден инструктор." };

  const [target] = await getDb()
    .select({ slug: instructors.slug })
    .from(instructors)
    .where(eq(instructors.id, instructorId));
  if (!target) return { error: "Инструкторът не съществува." };

  const r = await archiveInstructorRow(instructorId);
  if (!r.ok) {
    if (r.reason === "not_found") return { error: "Инструкторът не съществува." };
    return { error: "Инструкторът вече е архивиран." };
  }
  revalidateInstructorPaths(target.slug);
  return {
    ok:
      "Инструкторът е архивиран. Планираните часове и резервациите остават; " +
      `шаблоните му са деактивирани${r.templatesDisabled > 0 ? ` (${r.templatesDisabled})` : ""}` +
      (r.accessRemoved ? "; свързаният акаунт е изключен от панела" : "") +
      ".",
  };
}

export async function restoreInstructor(
  instructorId: number
): Promise<InstructorActionState> {
  await assertAdmin();
  if (!isSafeId(instructorId)) return { error: "Невалиден инструктор." };

  const [target] = await getDb()
    .select({ slug: instructors.slug })
    .from(instructors)
    .where(eq(instructors.id, instructorId));
  if (!target) return { error: "Инструкторът не съществува." };

  const r = await restoreInstructorRow(instructorId);
  if (!r.ok) {
    if (r.reason === "not_found") return { error: "Инструкторът не съществува." };
    return { error: "Инструкторът не е архивиран." };
  }
  revalidateInstructorPaths(target.slug);
  return {
    ok: "Инструкторът е възстановен. Достъпът до панела и шаблоните не се включват автоматично — свържи акаунт и активирай шаблоните, ако е нужно.",
  };
}

export type InstructorAccessState = { error?: string; ok?: string };

// Gives an existing (verified) account the instructor role + link. Errors are
// returned (not thrown) so the admin sees the exact reason in production too.
export async function linkInstructorAccess(
  instructorId: number,
  formData: FormData
): Promise<InstructorAccessState> {
  await assertAdmin();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Въведи имейл." };
  const r = await linkInstructorAccount({ email, instructor: { id: instructorId } });
  revalidatePath("/admin/instructors");
  return r.ok
    ? {
        ok:
          `Свързан акаунт: ${r.email}.` +
          (r.credentialsReset
            ? " Старите сесии и паролата са обезсилени: инструкторът първо задава парола през „Забравена парола“."
            : ""),
      }
    : { error: r.message };
}

export async function removeInstructorAccess(instructorId: number) {
  await assertAdmin();
  await unlinkInstructorAccount(instructorId);
  revalidatePath("/admin/instructors");
}

export async function uploadGalleryItem(formData: FormData) {
  await assertAdmin();
  const db = getDb();

  const file = formData.get("file") as File | null;
  const caption = String(formData.get("caption") ?? "");
  if (!file || file.size === 0) {
    throw new Error("Няма избран файл.");
  }

  // Only validated JPEG/PNG/WebP/MP4 are accepted (real type from magic bytes, see saveUpload).
  const { url, type: mediaType } = await uploadToStorage(file);

  await db
    .insert(galleryItems)
    .values({ type: mediaType === "video/mp4" ? "video" : "image", url, caption });
  revalidatePath("/admin/gallery");
  revalidateLocalized("/gallery");
}

export async function deleteGalleryItem(id: number) {
  await assertAdmin();
  const db = getDb();
  // The URL comes from the DB, never from the client.
  const [deleted] = await db
    .delete(galleryItems)
    .where(eq(galleryItems.id, id))
    .returning({ url: galleryItems.url });
  if (deleted) await deleteFromStorage(deleted.url);
  revalidatePath("/admin/gallery");
  revalidateLocalized("/gallery");
}

// ------------------------------------------------------ weekly template (schedule)

// Validation only (sport defaults + field parsing). The instructor
// active-check lives in the caller's transaction next to the write.
async function readTemplateForm(formData: FormData) {
  const [sport] = await getDb()
    .select({
      defaultDurationMin: sports.defaultDurationMin,
      defaultCapacity: sports.defaultCapacity,
      defaultPriceCents: sports.defaultPriceCents,
    })
    .from(sports)
    .where(eq(sports.id, Number(formData.get("sportId"))));
  if (!sport) throw new Error("Тренировката не съществува.");
  return parseTemplateForm(formData, sport);
}

export async function createTemplate(formData: FormData) {
  await assertAdmin();
  const parsed = await readTemplateForm(formData);
  // New templates need an active instructor; check and insert share one
  // transaction on the locked instructor row.
  await getDb().transaction(async (tx) => {
    if (!(await lockActiveInstructor(tx, parsed.instructorId))) {
      throw new Error(INSTRUCTOR_UNAVAILABLE);
    }
    await tx.insert(sessionTemplates).values(parsed);
  });
  revalidatePath("/admin/schedule");
}

export async function updateTemplate(templateId: number, formData: FormData) {
  await assertAdmin();
  const db = getDb();
  const parsed = await readTemplateForm(formData);
  const active = formData.get("active") === "on";

  await db.transaction(async (tx) => {
    const [fresh] = await tx
      .select({ instructorId: sessionTemplates.instructorId })
      .from(sessionTemplates)
      .where(eq(sessionTemplates.id, templateId));
    if (!fresh) throw new Error("Шаблонът не съществува.");
    // A template may KEEP its (possibly archived) instructor only while it
    // stays INACTIVE: a reassignment, or (re)activating the template, requires
    // an active instructor even when the id is unchanged — an archived
    // instructor's templates must not generate again after restore.
    const needsActiveInstructor =
      parsed.instructorId !== fresh.instructorId || active;
    if (needsActiveInstructor && !(await lockActiveInstructor(tx, parsed.instructorId))) {
      throw new Error(INSTRUCTOR_UNAVAILABLE);
    }
    // instructor_id unchanged since the read above; a concurrent edit that
    // reassigned the template in between is refused instead of overwritten.
    const updated = await tx
      .update(sessionTemplates)
      .set({ ...parsed, active })
      .where(
        and(
          eq(sessionTemplates.id, templateId),
          eq(sessionTemplates.instructorId, fresh.instructorId)
        )
      )
      .returning({ id: sessionTemplates.id });
    if (updated.length === 0) {
      throw new Error("Шаблонът беше променен от друг администратор. Опитай отново.");
    }
  });
  revalidatePath("/admin/schedule");
}

// Already generated sessions stay (class_sessions.template_id becomes NULL).
export async function deleteTemplate(templateId: number) {
  await assertAdmin();
  await getDb().delete(sessionTemplates).where(eq(sessionTemplates.id, templateId));
  revalidatePath("/admin/schedule");
}

export async function generateFromTemplates() {
  await assertAdmin();
  const result = await generateSessions();
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/sessions");
  revalidateLocalized("/schedule");
  return result;
}
