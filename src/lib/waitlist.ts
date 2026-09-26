import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { classSessions, sports, waitlistEntries } from "@/db/schema";
import { sendWaitlistSpotOpenEmail } from "./email";

// Several spots freeing up in quick succession shouldn't spam the same people.
const RENOTIFY_AFTER_MS = 30 * 60 * 1000;

// Emails everyone waiting for the session that a spot is open; first to book wins it.
export async function notifyWaitlist(sessionId: number) {
  const db = getDb();

  const [session] = await db
    .select({
      startTime: classSessions.startTime,
      capacity: classSessions.capacity,
      bookedCount: classSessions.bookedCount,
      cancelledAt: classSessions.cancelledAt,
      sportName: sports.name,
      sportSlug: sports.slug,
    })
    .from(classSessions)
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .where(eq(classSessions.id, sessionId));

  if (
    !session ||
    session.cancelledAt ||
    session.startTime.getTime() <= Date.now() ||
    session.bookedCount >= session.capacity
  ) {
    return;
  }

  const cutoff = new Date(Date.now() - RENOTIFY_AFTER_MS);
  const toNotify = await db
    .update(waitlistEntries)
    .set({ notifiedAt: sql`now()` })
    .where(
      and(
        eq(waitlistEntries.sessionId, sessionId),
        or(isNull(waitlistEntries.notifiedAt), lt(waitlistEntries.notifiedAt, cutoff))
      )
    )
    .returning({ userEmail: waitlistEntries.userEmail });

  const bookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sports/${session.sportSlug}`;

  await Promise.all(
    toNotify.map((entry) =>
      sendWaitlistSpotOpenEmail({
        to: entry.userEmail,
        sportName: session.sportName,
        startTime: session.startTime,
        bookUrl,
      })
    )
  );
}
