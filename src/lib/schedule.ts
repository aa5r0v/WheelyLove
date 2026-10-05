import { and, asc, eq, gt, gte, inArray, isNull, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports, waitlistEntries } from "@/db/schema";
import { fromSofiaDateTime, toSofiaDateInput } from "./format";

export const SCHEDULE_DAYS = 14;
// "Almost full" when this many places or fewer are left AND at least half of
// the class is taken - an empty 3-place class must not look almost full.
export const ALMOST_FULL_THRESHOLD = 3;

export type Occupancy = "free" | "almost" | "full";

export function occupancyOf(spotsLeft: number, capacity: number): Occupancy {
  if (spotsLeft <= 0) return "full";
  return spotsLeft <= ALMOST_FULL_THRESHOLD && spotsLeft * 2 <= capacity ? "almost" : "free";
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// The next 14 Sofia calendar days, starting today ("YYYY-MM-DD").
export function scheduleDates(now: Date = new Date()): string[] {
  const today = toSofiaDateInput(now);
  return Array.from({ length: SCHEDULE_DAYS }, (_, i) => addDays(today, i));
}

// The selected day from ?d=; anything outside the 14-day window falls back to today.
export function resolveDate(d: string | undefined, now: Date = new Date()): string {
  const dates = scheduleDates(now);
  return d && dates.includes(d) ? d : dates[0];
}

// [00:00, next 00:00) of a Sofia calendar day as UTC instants (23/25-hour days on DST changes).
export function dayRange(date: string) {
  return { from: fromSofiaDateTime(date, "00:00"), to: fromSofiaDateTime(addDays(date, 1), "00:00") };
}

export type ScheduleFilters = { sportSlug?: string; instructorSlug?: string };

export type ScheduleSession = {
  id: number;
  startTime: Date;
  endTime: Date;
  durationMin: number;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  occupancy: Occupancy;
  priceCents: number;
  sportSlug: string;
  sportName: string;
  sportColor: string;
  sportLevel: string;
  instructorSlug: string;
  instructorName: string;
  waitingCount: number;
};

function filterConditions(f: ScheduleFilters) {
  return [
    f.sportSlug ? eq(sports.slug, f.sportSlug) : undefined,
    f.instructorSlug ? eq(instructors.slug, f.instructorSlug) : undefined,
  ];
}

// Upcoming, non-cancelled sessions of one Sofia day, with free places.
export async function getDaySessions(
  date: string,
  filters: ScheduleFilters = {},
  now: Date = new Date()
): Promise<ScheduleSession[]> {
  const db = getDb();
  const { from, to } = dayRange(date);
  const rows = await db
    .select({
      id: classSessions.id,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      capacity: classSessions.capacity,
      bookedCount: classSessions.bookedCount,
      priceCents: classSessions.priceCents,
      sportSlug: sports.slug,
      sportName: sports.name,
      sportColor: sports.color,
      sportLevel: sports.level,
      instructorSlug: instructors.slug,
      instructorName: instructors.name,
    })
    .from(classSessions)
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .innerJoin(instructors, eq(classSessions.instructorId, instructors.id))
    .where(
      and(
        gte(classSessions.startTime, from),
        lt(classSessions.startTime, to),
        gt(classSessions.startTime, now),
        isNull(classSessions.cancelledAt),
        ...filterConditions(filters)
      )
    )
    .orderBy(asc(classSessions.startTime), asc(classSessions.id));

  const ids = rows.map((r) => r.id);
  const waiting = new Map<number, number>();
  if (ids.length) {
    const entries = await db
      .select({ sessionId: waitlistEntries.sessionId })
      .from(waitlistEntries)
      .where(inArray(waitlistEntries.sessionId, ids));
    for (const e of entries) waiting.set(e.sessionId, (waiting.get(e.sessionId) ?? 0) + 1);
  }

  return rows.map((r) => {
    const spotsLeft = Math.max(r.capacity - r.bookedCount, 0);
    return {
      ...r,
      durationMin: Math.round((r.endTime.getTime() - r.startTime.getTime()) / 60_000),
      spotsLeft,
      occupancy: occupancyOf(spotsLeft, r.capacity),
      waitingCount: waiting.get(r.id) ?? 0,
    };
  });
}

// Which of the given days have at least one upcoming session (for the dot under the date).
export async function getDaysWithSessions(
  dates: string[],
  filters: ScheduleFilters = {},
  now: Date = new Date()
): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ startTime: classSessions.startTime })
    .from(classSessions)
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .innerJoin(instructors, eq(classSessions.instructorId, instructors.id))
    .where(
      and(
        gte(classSessions.startTime, dayRange(dates[0]).from),
        lt(classSessions.startTime, dayRange(dates[dates.length - 1]).to),
        gt(classSessions.startTime, now),
        isNull(classSessions.cancelledAt),
        ...filterConditions(filters)
      )
    );
  return new Set(rows.map((r) => toSofiaDateInput(r.startTime)));
}

// What the signed-in user already has on these sessions: active bookings and
// their place in each waitlist queue (1-based, same ordering as the sport page).
export async function getUserSessionState(userId: string, sessionIds: number[]) {
  const booked = new Set<number>();
  const waitlistPosition = new Map<number, number>();
  if (!sessionIds.length) return { booked, waitlistPosition };
  const db = getDb();
  const mine = await db
    .select({ sessionId: bookings.sessionId })
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, userId),
        inArray(bookings.sessionId, sessionIds),
        inArray(bookings.status, ["pending", "confirmed"])
      )
    );
  for (const b of mine) booked.add(b.sessionId);
  const queue = await db
    .select({ sessionId: waitlistEntries.sessionId, userId: waitlistEntries.userId })
    .from(waitlistEntries)
    .where(inArray(waitlistEntries.sessionId, sessionIds))
    .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id));
  const seen = new Map<number, number>();
  for (const e of queue) {
    const pos = (seen.get(e.sessionId) ?? 0) + 1;
    seen.set(e.sessionId, pos);
    if (e.userId === userId) waitlistPosition.set(e.sessionId, pos);
  }
  return { booked, waitlistPosition };
}
