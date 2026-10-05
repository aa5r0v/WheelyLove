"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { bookings, classSessions } from "@/db/schema";
import { cancelBookingAndNotify } from "@/lib/bookings";
import { normalizePhone } from "@/lib/phone";
import { getSavedPhone, savePhone } from "@/lib/user-phone";

export async function cancelOwnBooking(bookingId: number) {
  const session = await getSession();
  if (!session) throw new Error("Неоторизиран достъп.");

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
    throw new Error("Резервацията не съществува.");
  }
  if (booking.status === "cancelled") {
    return;
  }
  if (booking.startTime.getTime() <= Date.now()) {
    throw new Error("Не може да откажеш резервация за час, който вече е минал.");
  }

  await cancelBookingAndNotify(bookingId);
  revalidatePath("/my-bookings");
}

export type PhoneResult = { ok: true; phone: string } | { ok: false; error: string };

// Updates the phone of the signed-in user only: the id always comes from the session.
export async function updateOwnPhone(raw: unknown): Promise<PhoneResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Неоторизиран достъп." };
  if (typeof raw !== "string") return { ok: false, error: "Невалиден телефонен номер." };
  const phone = normalizePhone(raw);
  if (!phone) {
    return {
      ok: false,
      error: "Невалиден телефонен номер. Въведи български (08… или +359…) или международен номер (+код на държавата…).",
    };
  }
  await savePhone(session.user.id, phone);
  revalidatePath("/my-bookings");
  return { ok: true, phone };
}

// The saved phone of the signed-in user (null when none / not signed in).
export async function getOwnPhone(): Promise<string | null> {
  const session = await getSession();
  return session ? getSavedPhone(session.user.id) : null;
}
