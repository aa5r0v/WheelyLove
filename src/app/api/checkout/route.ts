import { NextResponse } from "next/server";
import { and, count, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { normalizePhone } from "@/lib/phone";
import { savePhone } from "@/lib/user-phone";
import {
  bookings,
  classSessions,
  instructors,
  sports,
  waitlistEntries,
} from "@/db/schema";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { getSession } from "@/lib/auth";
import { requestLocale, resolveLocale } from "@/lib/locale";
import { serverError } from "@/lib/server-messages";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_BOOKINGS = 5;

function isUniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

class TooManyBookings extends Error {}

export async function POST(req: Request) {
  // За грешки преди четенето на тялото: езикът идва от x-app-locale (праща го
  // BookButton — надежден и без cookie), иначе от NEXT_LOCALE cookie-то.
  const headerLocale = requestLocale(req.headers);
  const session = await getSession(req.headers);
  if (!session) {
    return NextResponse.json({ error: serverError("unauth", headerLocale) }, { status: 401 });
  }
  if (!session.user.emailVerified) {
    return NextResponse.json(
      { error: serverError("verifyEmailBooking", headerLocale) },
      { status: 403 }
    );
  }

  let payload: { sessionId?: unknown; phone?: unknown; locale?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: serverError("invalidRequest", headerLocale) }, { status: 400 });
  }
  const { sessionId, phone: rawPhone } = payload;
  // Езикът на потребителя (от тялото, whitelist-нат до bg/en; cookie-то е
  // резервен източник): записва се в резервацията и определя езика на нейните писма.
  const locale = resolveLocale(payload.locale ?? headerLocale);
  if (
    typeof sessionId !== "number" ||
    !Number.isInteger(sessionId) ||
    typeof rawPhone !== "string"
  ) {
    return NextResponse.json({ error: serverError("invalidRequest", locale) }, { status: 400 });
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return NextResponse.json(
      { error: serverError("invalidPhone", locale) },
      { status: 400 }
    );
  }

  const db = getDb();
  const [classSession] = await db
    .select({
      id: classSessions.id,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      capacity: classSessions.capacity,
      cancelledAt: classSessions.cancelledAt,
      sportName: sports.name,
      instructorName: instructors.name,
    })
    .from(classSessions)
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .innerJoin(instructors, eq(classSessions.instructorId, instructors.id))
    .where(eq(classSessions.id, sessionId));

  if (!classSession || classSession.cancelledAt) {
    return NextResponse.json({ error: serverError("sessionNotFound", locale) }, { status: 404 });
  }
  if (classSession.startTime.getTime() <= Date.now()) {
    return NextResponse.json({ error: serverError("sessionStarted", locale) }, { status: 400 });
  }

  const [existingBooking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.sessionId, classSession.id),
        eq(bookings.userId, session.user.id),
        inArray(bookings.status, ["pending", "confirmed"])
      )
    );
  if (existingBooking) {
    return NextResponse.json({ error: serverError("duplicateBooking", locale) }, { status: 409 });
  }

  const email = session.user.email;

  // Claim the spot and create the booking in one transaction: a failing insert rolls the
  // bookedCount increment back, so no spot can leak.
  let booking: typeof bookings.$inferSelect | null;
  try {
    booking = await db.transaction(async (tx) => {
      // Serialize booking creation per user: without the lock, parallel requests would
      // all pass the count check before any of their inserts becomes visible.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${session.user.id}))`);

      const [{ recent }] = await tx
        .select({ recent: count() })
        .from(bookings)
        .where(
          and(
            eq(bookings.userId, session.user.id),
            gte(bookings.createdAt, new Date(Date.now() - RATE_LIMIT_WINDOW_MS))
          )
        );
      if (recent >= RATE_LIMIT_MAX_BOOKINGS) throw new TooManyBookings();

      // Atomic: only claims a spot if capacity allows it, immune to concurrent requests.
      const [claimed] = await tx
        .update(classSessions)
        .set({ bookedCount: sql`${classSessions.bookedCount} + 1` })
        .where(
          and(
            eq(classSessions.id, classSession.id),
            isNull(classSessions.cancelledAt),
            gt(classSessions.startTime, new Date()),
            sql`${classSessions.bookedCount} < ${classSessions.capacity}`
          )
        )
        .returning({ id: classSessions.id });
      if (!claimed) return null;

      const [inserted] = await tx
        .insert(bookings)
        .values({
          sessionId: classSession.id,
          userId: session.user.id,
          userEmail: email,
          userPhone: phone,
          status: "pending",
          paymentMethod: "cash",
          locale,
        })
        .returning();

      await tx
        .delete(waitlistEntries)
        .where(
          and(
            eq(waitlistEntries.sessionId, classSession.id),
            eq(waitlistEntries.userId, session.user.id)
          )
        );
      return inserted;
    });
  } catch (err) {
    if (err instanceof TooManyBookings) {
      return NextResponse.json(
        { error: serverError("rateLimited", locale) },
        { status: 429 }
      );
    }
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: serverError("duplicateBooking", locale) }, { status: 409 });
    }
    throw err;
  }

  if (!booking) {
    return NextResponse.json({ error: serverError("noSpots", locale) }, { status: 409 });
  }

  // Remember the number for next time (the booking already keeps its own snapshot).
  // A failure here must not turn a successful booking into an error.
  try {
    await savePhone(session.user.id, phone);
  } catch (err) {
    console.error("Failed to save the user's phone", err);
  }

  await sendBookingConfirmationEmail({
    to: email,
    sessionId: classSession.id,
    sportName: classSession.sportName,
    instructorName: classSession.instructorName,
    startTime: classSession.startTime,
    endTime: classSession.endTime,
    locale,
  });
  // The id lets /booking/success?s=… show which session was booked.
  return NextResponse.json({ ok: true, bookingId: booking.id });
}
