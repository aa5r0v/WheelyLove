import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports } from "@/db/schema";
import { sendBookingReminderEmail } from "@/lib/email";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not configured; refusing to run reminders.");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const provided = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000);

  const dueBookings = await db
    .select({
      id: bookings.id,
      userEmail: bookings.userEmail,
      paymentMethod: bookings.paymentMethod,
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
        // Pay-on-site bookings stay "pending" until the studio marks them paid — remind them too.
        inArray(bookings.status, ["pending", "confirmed"]),
        isNull(bookings.reminderSentAt),
        gte(classSessions.startTime, now),
        lte(classSessions.startTime, windowEnd)
      )
    );

  let sent = 0;
  for (const b of dueBookings) {
    // Claim before sending so overlapping runs never remind twice.
    const [claimed] = await db
      .update(bookings)
      .set({ reminderSentAt: new Date() })
      .where(and(eq(bookings.id, b.id), isNull(bookings.reminderSentAt)))
      .returning({ id: bookings.id });
    if (!claimed) continue;

    sent++;
    await sendBookingReminderEmail({
      to: b.userEmail,
      sportName: b.sportName,
      instructorName: b.instructorName,
      startTime: b.startTime,
      paymentMethod: b.paymentMethod,
    });
  }

  return NextResponse.json({ sent });
}
