"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { bookings, classSessions } from "@/db/schema";
import { cancelBookingAndNotify } from "@/lib/bookings";
import { normalizePhone } from "@/lib/phone";
import { getSavedPhone, savePhone } from "@/lib/user-phone";
import { actionError } from "@/lib/server-messages";

export async function cancelOwnBooking(bookingId: number) {
  const session = await getSession();
  if (!session) throw new Error(await actionError("unauth"));

  const db = getDb();
  const [booking] = await db
    .select({
      userId: bookings.userId,
      status: bookings.status,
      startTime: classSessions.startTime,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .where(eq(bookings.id, bookingId));

  if (!booking || booking.userId !== session.user.id) {
    throw new Error(await actionError("bookingNotFound"));
  }
  if (booking.status === "cancelled") {
    return;
  }
  if (booking.startTime.getTime() <= Date.now()) {
    throw new Error(await actionError("cancelPast"));
  }

  await cancelBookingAndNotify(bookingId);
  revalidatePath("/my-bookings");
  revalidatePath("/en/my-bookings");
}

export type PhoneResult = { ok: true; phone: string } | { ok: false; error: string };

// Updates the phone of the signed-in user only: the id always comes from the session.
export async function updateOwnPhone(raw: unknown): Promise<PhoneResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: await actionError("unauth") };
  if (typeof raw !== "string") return { ok: false, error: await actionError("invalidPhone") };
  const phone = normalizePhone(raw);
  if (!phone) {
    return { ok: false, error: await actionError("invalidPhone") };
  }
  await savePhone(session.user.id, phone);
  revalidatePath("/my-bookings");
  revalidatePath("/en/my-bookings");
  return { ok: true, phone };
}

// The saved phone of the signed-in user (null when none / not signed in).
export async function getOwnPhone(): Promise<string | null> {
  const session = await getSession();
  return session ? getSavedPhone(session.user.id) : null;
}

// The email of the signed-in user (null when not signed in). Needed where the
// unverified-email resend flow runs outside /my-bookings (BookButton's 403).
export async function getOwnEmail(): Promise<string | null> {
  const session = await getSession();
  return session ? session.user.email : null;
}
