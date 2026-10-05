"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { bookings, classSessions, sports, waitlistEntries } from "@/db/schema";

const MAX_WAITLIST_ENTRIES_PER_USER = 20;

export async function joinWaitlist(sessionId: number) {
  // Every action checks the session itself; proxy-level protection is never assumed.
  const session = await getSession();
  if (!session) throw new Error("Неоторизиран достъп.");
  if (!session.user.emailVerified) {
    throw new Error("Потвърди имейла си, за да се запишеш — нов линк можеш да получиш от „Моите резервации“.");
  }

  const db = getDb();
  const [classSession] = await db
    .select({
      startTime: classSessions.startTime,
      capacity: classSessions.capacity,
      bookedCount: classSessions.bookedCount,
      cancelledAt: classSessions.cancelledAt,
      sportSlug: sports.slug,
    })
    .from(classSessions)
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .where(eq(classSessions.id, sessionId));

  if (!classSession || classSession.cancelledAt || classSession.startTime.getTime() <= Date.now()) {
    throw new Error("Часът не е наличен.");
  }
  if (classSession.bookedCount < classSession.capacity) {
    throw new Error("Има свободни места — можеш да се запишеш директно.");
  }

  const [existingBooking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.sessionId, sessionId),
        eq(bookings.userId, session.user.id),
        inArray(bookings.status, ["pending", "confirmed"])
      )
    );
  if (existingBooking) {
    throw new Error("Вече имаш резервация за този час.");
  }

  // Cap per-user waitlist entries so one account can't flood the table (and later the mailer).
  const [{ active }] = await db
    .select({ active: count() })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.userId, session.user.id));
  if (active >= MAX_WAITLIST_ENTRIES_PER_USER) {
    throw new Error("Твърде много записвания в списъка на чакащите.");
  }

  await db
    .insert(waitlistEntries)
    .values({
      sessionId,
      userId: session.user.id,
      userEmail: session.user.email,
    })
    .onConflictDoNothing();

  revalidatePath(`/sports/${classSession.sportSlug}`);
  revalidatePath("/schedule");
}

export async function leaveWaitlist(sessionId: number) {
  const session = await getSession();
  if (!session) throw new Error("Неоторизиран достъп.");

  const db = getDb();
  await db
    .delete(waitlistEntries)
    .where(
      and(eq(waitlistEntries.sessionId, sessionId), eq(waitlistEntries.userId, session.user.id))
    );

  const [classSession] = await db
    .select({ sportSlug: sports.slug })
    .from(classSessions)
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .where(eq(classSessions.id, sessionId));
  if (classSession) revalidatePath(`/sports/${classSession.sportSlug}`);
  revalidatePath("/schedule");
}
