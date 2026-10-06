"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { bookings, classSessions, sports, waitlistEntries } from "@/db/schema";
import { actionError, serverError } from "@/lib/server-messages";
import { resolveLocale } from "@/lib/locale";

const MAX_WAITLIST_ENTRIES_PER_USER = 20;

export async function joinWaitlist(sessionId: number, locale?: "bg" | "en") {
  // Every action checks the session itself; proxy-level protection is never assumed.
  // Езикът на грешките и на бъдещото известие: изрично подаден (whitelist) или
  // от middleware header-а на заявката.
  const loc = resolveLocale(locale);
  const session = await getSession();
  if (!session) throw new Error(await actionError("unauth"));
  if (!session.user.emailVerified) {
    throw new Error(await actionError("verifyEmailWaitlist"));
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
    throw new Error(serverError("waitlistUnavailable", loc));
  }
  if (classSession.bookedCount < classSession.capacity) {
    throw new Error(serverError("waitlistHasSpots", loc));
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
    throw new Error(serverError("duplicateBooking", loc));
  }

  // Cap per-user waitlist entries so one account can't flood the table (and later the mailer).
  const [{ active }] = await db
    .select({ active: count() })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.userId, session.user.id));
  if (active >= MAX_WAITLIST_ENTRIES_PER_USER) {
    throw new Error(serverError("waitlistTooMany", loc));
  }

  await db
    .insert(waitlistEntries)
    .values({
      sessionId,
      userId: session.user.id,
      userEmail: session.user.email,
      // Запазва се сега: асинхронното известие за свободно място ще е на този език.
      locale: loc,
    })
    .onConflictDoNothing();

  revalidatePath(`/sports/${classSession.sportSlug}`);
  revalidatePath(`/en/sports/${classSession.sportSlug}`);
  revalidatePath("/schedule");
  revalidatePath("/en/schedule");
}

export async function leaveWaitlist(sessionId: number) {
  const session = await getSession();
  if (!session) throw new Error(await actionError("unauth"));

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
  if (classSession) revalidatePath(`/en/sports/${classSession.sportSlug}`);
  revalidatePath("/schedule");
  revalidatePath("/en/schedule");
}
