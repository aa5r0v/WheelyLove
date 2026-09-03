import { NextResponse } from "next/server";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports } from "@/db/schema";
import { sendBookingReminderEmail } from "@/lib/email";
import { sendBookingReminderSms } from "@/lib/sms";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000);

  const dueBookings = await db
    .select({
      id: bookings.id,
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
    .where(
      and(
        eq(bookings.status, "confirmed"),
        isNull(bookings.reminderSentAt),
        gte(classSessions.startTime, now),
        lte(classSessions.startTime, windowEnd)
      )
    );

  for (const b of dueBookings) {
    await Promise.all([
      sendBookingReminderEmail({
        to: b.userEmail,
        sportName: b.sportName,
        instructorName: b.instructorName,
        startTime: b.startTime,
        paymentMethod: "card",
      }),
      sendBookingReminderSms({
        to: b.userPhone,
        sportName: b.sportName,
        startTime: b.startTime,
      }),
    ]);
    await db
      .update(bookings)
      .set({ reminderSentAt: new Date() })
      .where(eq(bookings.id, b.id));
  }

  return NextResponse.json({ sent: dueBookings.length });
}
