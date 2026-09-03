"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { bookings, classSessions } from "@/db/schema";
import { cancelBookingAndNotify } from "@/lib/bookings";

export async function cancelOwnBooking(bookingId: number) {
  const user = await currentUser();
  if (!user) throw new Error("Неоторизиран достъп.");

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

  if (!booking || booking.userId !== user.id) {
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
