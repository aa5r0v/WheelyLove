import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { bookings, classSessions, instructors, sports } from "@/db/schema";
import { sendBookingCancelledEmail } from "./email";
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
      });
    if (!row) return null;
    await decrementSessionSpot(tx, row.sessionId);
    return row;
  });

  if (cancelled) await notifyWaitlistSafe(cancelled.sessionId);
  return cancelled;
}

// The booking shown on /booking/success?s=… — only its owner ever gets it;
// for anyone else's id (or a wrong/absent id) there is nothing to show.
export async function getOwnBookingDetail(userId: string, bookingId: number) {
  const db = getDb();
  const [row] = await db
    .select({
      id: bookings.id,
      sessionId: bookings.sessionId,
      status: bookings.status,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      sportName: sports.name,
      instructorName: instructors.name,
      priceCents: classSessions.priceCents,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    // instructor_id is NOT NULL on class_sessions, so every session has one.
    .innerJoin(instructors, eq(classSessions.instructorId, instructors.id))
    .where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId)));
  return row ?? null;
}

export async function cancelBookingAndNotify(
  bookingId: number,
  reason: "booking" | "session" = "booking"
) {
  const db = getDb();

  const [booking] = await db
    .select({
      userEmail: bookings.userEmail,
      locale: bookings.locale,
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

  // Отказът се пише на запазения при резервацията език, не на текущия cookie.
  await sendBookingCancelledEmail({
    to: booking.userEmail,
    sportName: booking.sportName,
    startTime: booking.startTime,
    reason,
    locale: booking.locale === "en" ? "en" : "bg",
  });
}
