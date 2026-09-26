"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bookings,
  classSessions,
  galleryItems,
  instructors,
  sports,
} from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { sendBookingConfirmationSms } from "@/lib/sms";
import { uploadToStorage, deleteFromStorage } from "@/lib/storage";
import { cancelBookingAndNotify } from "@/lib/bookings";
import { notifyWaitlist } from "@/lib/waitlist";
import { fromSofiaDateTime } from "@/lib/format";

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
    await cancelBookingAndNotify(b.id);
  }

  revalidatePath("/admin/sessions");
  revalidatePath("/");
}

export async function cancelBooking(bookingId: number) {
  await assertAdmin();
  await cancelBookingAndNotify(bookingId);
  revalidatePath("/admin/bookings");
}

export async function confirmCashBooking(bookingId: number) {
  await assertAdmin();
  const db = getDb();

  await db
    .update(bookings)
    .set({ status: "confirmed" })
    .where(eq(bookings.id, bookingId));

  const [details] = await db
    .select({
      userEmail: bookings.userEmail,
      userPhone: bookings.userPhone,
      startTime: classSessions.startTime,
      sportName: sports.name,
      instructorName: instructors.name,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .innerJoin(instructors, eq(classSessions.instructorId, instructors.id))
    .where(eq(bookings.id, bookingId));

  if (details) {
    await Promise.all([
      sendBookingConfirmationEmail({
        to: details.userEmail,
        sportName: details.sportName,
        instructorName: details.instructorName,
        startTime: details.startTime,
        paymentMethod: "cash",
      }),
      sendBookingConfirmationSms({
        to: details.userPhone,
        sportName: details.sportName,
        startTime: details.startTime,
      }),
    ]);
  }

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

export async function uploadGalleryItem(formData: FormData) {
  await assertAdmin();
  const db = getDb();

  const file = formData.get("file") as File | null;
  const caption = String(formData.get("caption") ?? "");
  if (!file || file.size === 0) {
    throw new Error("Няма избран файл.");
  }

  const type = file.type.startsWith("video") ? "video" : "image";
  const { url } = await uploadToStorage(file);

  await db.insert(galleryItems).values({ type, url, caption });
  revalidatePath("/admin/gallery");
  revalidatePath("/gallery");
}

export async function deleteGalleryItem(id: number, url: string) {
  await assertAdmin();
  const db = getDb();
  await db.delete(galleryItems).where(eq(galleryItems.id, id));
  await deleteFromStorage(url);
  revalidatePath("/admin/gallery");
  revalidatePath("/gallery");
}
