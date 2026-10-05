import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports, user, waitlistEntries } from "@/db/schema";
import { getSession } from "./auth";
import { fromSofiaDateTime, toSofiaDateInput } from "./format";

export type InstructorRow = typeof instructors.$inferSelect;

// The instructor row of the signed-in user. Every read and write in /instructor
// starts here. null unless the role is exactly "instructor", the email is
// verified AND an instructors row points at this user. An admin is NOT an
// instructor automatically (he has /admin).
export async function getInstructorForSession(reqHeaders?: Headers): Promise<InstructorRow | null> {
  const session = await getSession(reqHeaders);
  if (!session) return null;
  if (session.user.role !== "instructor" || session.user.emailVerified !== true) return null;
  const [row] = await getDb()
    .select()
    .from(instructors)
    .where(eq(instructors.userId, session.user.id));
  return row ?? null;
}

const ACTIVE = ["pending", "confirmed"] as const;

export type InstructorSessionItem = {
  id: number;
  startTime: Date;
  endTime: Date;
  capacity: number;
  bookedCount: number;
  cancelledAt: Date | null;
  sportName: string;
  sportColor: string;
  waitingCount: number;
};

async function waitingCounts(ids: number[]) {
  const map = new Map<number, number>();
  if (!ids.length) return map;
  const rows = await getDb()
    .select({ sessionId: waitlistEntries.sessionId, n: sql<number>`count(*)::int` })
    .from(waitlistEntries)
    .where(inArray(waitlistEntries.sessionId, ids))
    .groupBy(waitlistEntries.sessionId);
  for (const r of rows) map.set(r.sessionId, r.n);
  return map;
}

// Only this instructor's sessions. upcoming: not started yet, soonest first;
// past: already started, newest first (limited).
export async function listInstructorSessions(
  instructorId: number,
  now: Date = new Date(),
  pastLimit = 50
) {
  const db = getDb();
  const base = () =>
    db
      .select({
        id: classSessions.id,
        startTime: classSessions.startTime,
        endTime: classSessions.endTime,
        capacity: classSessions.capacity,
        bookedCount: classSessions.bookedCount,
        cancelledAt: classSessions.cancelledAt,
        sportName: sports.name,
        sportColor: sports.color,
      })
      .from(classSessions)
      .innerJoin(sports, eq(classSessions.sportId, sports.id));
  const upcoming = await base()
    .where(and(eq(classSessions.instructorId, instructorId), gt(classSessions.startTime, now)))
    .orderBy(asc(classSessions.startTime), asc(classSessions.id));
  const past = await base()
    .where(and(eq(classSessions.instructorId, instructorId), lte(classSessions.startTime, now)))
    .orderBy(desc(classSessions.startTime), desc(classSessions.id))
    .limit(pastLimit);
  const waiting = await waitingCounts([...upcoming, ...past].map((s) => s.id));
  const withWaiting = (s: Omit<InstructorSessionItem, "waitingCount">): InstructorSessionItem => ({
    ...s,
    waitingCount: waiting.get(s.id) ?? 0,
  });
  return { upcoming: upcoming.map(withWaiting), past: past.map(withWaiting) };
}

// One session of THIS instructor with its attendees; null when the session does
// not exist or belongs to someone else (the caller answers notFound(), so the
// existence of other instructors' sessions is not revealed).
export async function getInstructorSession(
  instructorId: number,
  sessionId: number,
  now: Date = new Date()
) {
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) return null;
  const db = getDb();
  const [s] = await db
    .select({
      id: classSessions.id,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      capacity: classSessions.capacity,
      bookedCount: classSessions.bookedCount,
      priceCents: classSessions.priceCents,
      cancelledAt: classSessions.cancelledAt,
      sportName: sports.name,
    })
    .from(classSessions)
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .where(and(eq(classSessions.id, sessionId), eq(classSessions.instructorId, instructorId)));
  if (!s) return null;
  const attendees = await db
    .select({
      id: bookings.id,
      name: sql<string>`coalesce(${user.name}, ${bookings.userEmail})`,
      phone: bookings.userPhone,
      status: bookings.status,
      attendance: bookings.attendance,
    })
    .from(bookings)
    .leftJoin(user, eq(user.id, bookings.userId))
    .where(and(eq(bookings.sessionId, s.id), inArray(bookings.status, [...ACTIVE])))
    .orderBy(asc(bookings.createdAt), asc(bookings.id));
  const waiting = await waitingCounts([s.id]);
  return {
    ...s,
    started: s.startTime.getTime() <= now.getTime(),
    attendees,
    waitingCount: waiting.get(s.id) ?? 0,
  };
}

export type AttendanceValue = "unknown" | "attended" | "no_show";
export const ATTENDANCE_VALUES: readonly AttendanceValue[] = ["unknown", "attended", "no_show"];
export type AttendanceResult = "ok" | "not_found" | "not_started" | "not_active";

// Attendance of one booking. The booking must be in THIS instructor's session
// (and in exactly the session given), active, and the session must have
// started and not be cancelled. The write itself repeats every condition, so a
// concurrent change cannot slip through between the check and the update.
export async function setBookingAttendance(
  instructorId: number,
  sessionId: number,
  bookingId: number,
  attendance: AttendanceValue,
  now: Date = new Date()
): Promise<AttendanceResult> {
  const db = getDb();
  const [row] = await db
    .select({
      status: bookings.status,
      startTime: classSessions.startTime,
      cancelledAt: classSessions.cancelledAt,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.sessionId, sessionId),
        eq(classSessions.instructorId, instructorId)
      )
    );
  if (!row) return "not_found";
  if (row.cancelledAt || row.status === "cancelled") return "not_active";
  if (row.startTime.getTime() > now.getTime()) return "not_started";

  const own = db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.id, sessionId),
        eq(classSessions.instructorId, instructorId),
        lte(classSessions.startTime, now),
        isNull(classSessions.cancelledAt)
      )
    );
  const updated = await db
    .update(bookings)
    .set({ attendance })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.sessionId, sessionId),
        inArray(bookings.status, [...ACTIVE]),
        inArray(bookings.sessionId, own)
      )
    )
    .returning({ id: bookings.id });
  return updated.length ? "ok" : "not_active";
}

export type MonthReport = {
  month: string;
  sessions: number;
  booked: number;
  attended: number;
  noShow: number;
  fillPercent: number;
  revenueCents: number;
};

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// "YYYY-MM" from ?month=, falling back to the current Sofia month.
export function resolveMonth(raw: string | undefined, now: Date = new Date()): string {
  return raw && MONTH_RE.test(raw) ? raw : toSofiaDateInput(now).slice(0, 7);
}

// Held sessions of the Sofia month: started (<= now) and not cancelled, this
// instructor only. fill % = active bookings / total capacity of those sessions;
// revenue = price of the ATTENDED bookings (pay-on-site, informational).
export async function getMonthReport(
  instructorId: number,
  month: string,
  now: Date = new Date()
): Promise<MonthReport> {
  if (!MONTH_RE.test(month)) throw new Error("Invalid month");
  const [y, m] = month.split("-").map(Number);
  const from = fromSofiaDateTime(`${month}-01`, "00:00");
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const to = fromSofiaDateTime(`${next}-01`, "00:00");

  const db = getDb();
  const held = await db
    .select({
      id: classSessions.id,
      capacity: classSessions.capacity,
      priceCents: classSessions.priceCents,
    })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.instructorId, instructorId),
        gte(classSessions.startTime, from),
        lt(classSessions.startTime, to),
        lte(classSessions.startTime, now),
        isNull(classSessions.cancelledAt)
      )
    );
  const report: MonthReport = {
    month,
    sessions: held.length,
    booked: 0,
    attended: 0,
    noShow: 0,
    fillPercent: 0,
    revenueCents: 0,
  };
  if (!held.length) return report;
  const price = new Map(held.map((s) => [s.id, s.priceCents]));
  const rows = await db
    .select({ sessionId: bookings.sessionId, attendance: bookings.attendance })
    .from(bookings)
    .where(
      and(
        inArray(
          bookings.sessionId,
          held.map((s) => s.id)
        ),
        inArray(bookings.status, [...ACTIVE])
      )
    );
  for (const b of rows) {
    report.booked++;
    if (b.attendance === "attended") {
      report.attended++;
      report.revenueCents += price.get(b.sessionId) ?? 0;
    } else if (b.attendance === "no_show") report.noShow++;
  }
  const capacity = held.reduce((n, s) => n + s.capacity, 0);
  report.fillPercent = capacity > 0 ? Math.round((report.booked / capacity) * 100) : 0;
  return report;
}
