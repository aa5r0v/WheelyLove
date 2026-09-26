"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { bookings, classSessions, sports, waitlistEntries } from "@/db/schema";

export async function joinWaitlist(sessionId: number) {
  const user = await currentUser();
  if (!user) throw new Error("Неоторизиран достъп.");

  const db = getDb();
  const [session] = await db
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

  if (!session || session.cancelledAt || session.startTime.getTime() <= Date.now()) {
    throw new Error("Часът не е наличен.");
  }
  if (session.bookedCount < session.capacity) {
    throw new Error("Има свободни места — можеш да се запишеш директно.");
  }

  const [existingBooking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.sessionId, sessionId),
        eq(bookings.userId, user.id),
        inArray(bookings.status, ["pending", "confirmed"])
      )
    );
  if (existingBooking) {
    throw new Error("Вече имаш резервация за този час.");
  }

  await db
    .insert(waitlistEntries)
    .values({
      sessionId,
      userId: user.id,
      userEmail: user.primaryEmailAddress?.emailAddress ?? "",
    })
    .onConflictDoNothing();

  revalidatePath(`/sports/${session.sportSlug}`);
}

export async function leaveWaitlist(sessionId: number) {
  const user = await currentUser();
  if (!user) throw new Error("Неоторизиран достъп.");

  const db = getDb();
  await db
    .delete(waitlistEntries)
    .where(and(eq(waitlistEntries.sessionId, sessionId), eq(waitlistEntries.userId, user.id)));

  const [session] = await db
    .select({ sportSlug: sports.slug })
    .from(classSessions)
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .where(eq(classSessions.id, sessionId));
  if (session) revalidatePath(`/sports/${session.sportSlug}`);
}
