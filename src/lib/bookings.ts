import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions, sports } from "@/db/schema";
import { refundPayment } from "./stripe";
import { sendBookingCancelledEmail } from "./email";
import { sendBookingCancelledSms } from "./sms";

export async function releaseSessionSpot(sessionId: number) {
  const db = getDb();
  await db
    .update(classSessions)
    .set({ bookedCount: sql`greatest(${classSessions.bookedCount} - 1, 0)` })
    .where(eq(classSessions.id, sessionId));
}

export async function cancelBookingAndNotify(bookingId: number) {
  const db = getDb();

  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      paymentMethod: bookings.paymentMethod,
      stripePaymentIntentId: bookings.stripePaymentIntentId,
      userEmail: bookings.userEmail,
      userPhone: bookings.userPhone,
      sessionId: bookings.sessionId,
      startTime: classSessions.startTime,
      sportName: sports.name,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .where(eq(bookings.id, bookingId));

  if (!booking || booking.status === "cancelled") return;

  const wasHoldingSpot = booking.status === "pending" || booking.status === "confirmed";

  let refunded = false;
  if (
    booking.status === "confirmed" &&
    booking.paymentMethod === "card" &&
    booking.stripePaymentIntentId
  ) {
    refunded = await refundPayment(booking.stripePaymentIntentId);
  }

  await db
    .update(bookings)
    .set({ status: "cancelled" })
    .where(eq(bookings.id, bookingId));

  if (wasHoldingSpot) {
    await releaseSessionSpot(booking.sessionId);
  }

  await Promise.all([
    sendBookingCancelledEmail({
      to: booking.userEmail,
      sportName: booking.sportName,
      startTime: booking.startTime,
      refunded,
    }),
    sendBookingCancelledSms({
      to: booking.userPhone,
      sportName: booking.sportName,
      startTime: booking.startTime,
    }),
  ]);
}
