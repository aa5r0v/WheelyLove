import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { bookings, classSessions, sports } from "@/db/schema";
import { refundPayment } from "./stripe";
import { sendBookingCancelledEmail } from "./email";
import { sendBookingCancelledSms } from "./sms";
import { notifyWaitlist } from "./waitlist";

// Frees one spot. Pass a transaction so it commits together with the status change.
export async function decrementSessionSpot(executor: DbOrTx, sessionId: number) {
  await executor
    .update(classSessions)
    .set({ bookedCount: sql`greatest(${classSessions.bookedCount} - 1, 0)` })
    .where(eq(classSessions.id, sessionId));
}

export async function notifyWaitlistSafe(sessionId: number) {
  try {
    await notifyWaitlist(sessionId);
  } catch (err) {
    console.error("Failed to notify waitlist:", err);
  }
}

export async function releaseSessionSpot(sessionId: number) {
  await decrementSessionSpot(getDb(), sessionId);
  await notifyWaitlistSafe(sessionId);
}

// Atomically moves a booking pending/confirmed -> cancelled and releases its spot in the
// same transaction. Returns the updated row only for the single caller that won the
// transition; every concurrent/repeated call gets null and must do nothing further.
export async function cancelBookingAtomic(bookingId: number) {
  const db = getDb();
  const cancelled = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(bookings)
      .set({ status: "cancelled" })
      .where(
        and(eq(bookings.id, bookingId), inArray(bookings.status, ["pending", "confirmed"]))
      )
      .returning({
        id: bookings.id,
        sessionId: bookings.sessionId,
        paymentMethod: bookings.paymentMethod,
        stripePaymentIntentId: bookings.stripePaymentIntentId,
      });
    if (!row) return null;
    await decrementSessionSpot(tx, row.sessionId);
    return row;
  });

  if (cancelled) await notifyWaitlistSafe(cancelled.sessionId);
  return cancelled;
}

export async function cancelBookingAndNotify(
  bookingId: number,
  reason: "booking" | "session" = "booking"
) {
  const db = getDb();

  const [booking] = await db
    .select({
      userEmail: bookings.userEmail,
      userPhone: bookings.userPhone,
      startTime: classSessions.startTime,
      sportName: sports.name,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .where(eq(bookings.id, bookingId));

  if (!booking) return;

  const cancelled = await cancelBookingAtomic(bookingId);
  if (!cancelled) return;

  // A payment intent is only stored once the card payment was confirmed.
  let refunded = false;
  if (cancelled.paymentMethod === "card" && cancelled.stripePaymentIntentId) {
    refunded = await refundPayment(cancelled.stripePaymentIntentId);
  }

  await Promise.all([
    sendBookingCancelledEmail({
      to: booking.userEmail,
      sportName: booking.sportName,
      startTime: booking.startTime,
      refunded,
      reason,
    }),
    sendBookingCancelledSms({
      to: booking.userPhone,
      sportName: booking.sportName,
      startTime: booking.startTime,
      reason,
    }),
  ]);
}
