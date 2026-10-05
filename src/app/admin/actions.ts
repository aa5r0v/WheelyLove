"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bookings,
  classSessions,
  galleryItems,
  instructors,
  sessionTemplates,
  sports,
} from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { uploadToStorage, deleteFromStorage } from "@/lib/storage";
import { cancelBookingAndNotify } from "@/lib/bookings";
import { notifyWaitlist } from "@/lib/waitlist";
import { fromSofiaDateTime } from "@/lib/format";
import {
  parseLevel,
  parseOptionalEuroToCents,
  parseOptionalInt,
  parseTemplateForm,
} from "@/lib/trainings";
import { generateSessions } from "@/lib/schedule-generator";
import { linkInstructorAccount, unlinkInstructorAccount } from "@/lib/instructor-link";

async function assertAdmin() {
  if (!(await isAdmin())) {
    throw new Error("Нямаш права за администратор.");
  }
}

export async function createSession(formData: FormData) {
  await assertAdmin();
  const db = getDb();

  const sportId = Number(formData.get("sportId"));
  const instructorId = Number(formData.get("instructorId"));
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

  await db.insert(classSessions).values(rows);

  revalidatePath("/admin/sessions");
  revalidatePath("/");
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

  await db
    .update(classSessions)
    .set({
      sportId,
      instructorId,
      startTime: fromSofiaDateTime(date, startTimeStr),
      endTime: fromSofiaDateTime(date, endTimeStr),
      capacity,
      priceCents: Math.round(priceEuro * 100),
    })
    .where(eq(classSessions.id, sessionId));

  try {
    await notifyWaitlist(sessionId);
  } catch (err) {
    console.error("Failed to notify waitlist:", err);
  }

  revalidatePath("/admin/sessions");
  revalidatePath("/");
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
  revalidatePath("/");
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

export async function createInstructor(formData: FormData) {
  await assertAdmin();
  const db = getDb();
  await db.insert(instructors).values({
    slug: String(formData.get("slug")),
    name: String(formData.get("name")),
    bio: String(formData.get("bio") ?? ""),
    email: String(formData.get("email") ?? "") || null,
    phone: String(formData.get("phone") ?? "") || null,
    specialties: String(formData.get("specialties") ?? ""),
  });
  revalidatePath("/admin/instructors");
  revalidatePath("/instructors");
}

export async function deleteInstructor(instructorId: number) {
  await assertAdmin();
  const db = getDb();
  await db.delete(instructors).where(eq(instructors.id, instructorId));
  revalidatePath("/admin/instructors");
  revalidatePath("/instructors");
}

export type InstructorAccessState = { error?: string; ok?: string };

// Gives an existing (verified) account the instructor role + link. Errors are
// returned (not thrown) so the admin sees the exact reason in production too.
export async function linkInstructorAccess(
  instructorId: number,
  _prev: InstructorAccessState,
  formData: FormData
): Promise<InstructorAccessState> {
  await assertAdmin();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Въведи имейл." };
  const r = await linkInstructorAccount({ email, instructor: { id: instructorId } });
  revalidatePath("/admin/instructors");
  return r.ok ? { ok: `Свързан акаунт: ${r.email}` } : { error: r.message };
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
  revalidatePath("/gallery");
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
  revalidatePath("/gallery");
}

// ------------------------------------------------------ weekly template (schedule)

async function readTemplateForm(formData: FormData) {
  const db = getDb();
  const [sport] = await db
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
  await getDb().insert(sessionTemplates).values(await readTemplateForm(formData));
  revalidatePath("/admin/schedule");
}

export async function updateTemplate(templateId: number, formData: FormData) {
  await assertAdmin();
  await getDb()
    .update(sessionTemplates)
    .set({ ...(await readTemplateForm(formData)), active: formData.get("active") === "on" })
    .where(eq(sessionTemplates.id, templateId));
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
  revalidatePath("/schedule");
  return result;
}
