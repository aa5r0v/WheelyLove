import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { classSessions, instructors, sports } from "@/db/schema";
import { buildSessionIcs, sessionCalendarDescription, sessionCalendarTitle } from "@/lib/calendar";
import { sportName as localizedSportName } from "@/lib/sport-content";

// Public .ics for one class session — the same data anyone can already see on
// /schedule (sport, instructor, times, place), so no authentication. Only the
// booking confirmation links here; a bare guess of another session id reveals
// nothing private.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Only a plain positive integer is a valid session id; anything else (and any
  // non-existent or cancelled session) is simply "not found".
  // Postgres int4 tops out at 2147483647 — a bigger id would throw (500), not 404.
  if (!/^\d+$/.test(id) || Number(id) <= 0 || Number(id) > 2147483647) {
    return NextResponse.json({ error: "Няма такъв час." }, { status: 404 });
  }
  const sessionId = Number(id);
  // ?l=en — езикът на етикетите в .ics (whitelist, по подразбиране български).
  const locale = new URL(req.url).searchParams.get("l") === "en" ? ("en" as const) : ("bg" as const);

  const db = getDb();
  const [session] = await db
    .select({
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      sportName: sports.name,
      instructorName: instructors.name,
    })
    .from(classSessions)
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .innerJoin(instructors, eq(classSessions.instructorId, instructors.id))
    .where(
      and(
        eq(classSessions.id, sessionId),
        isNull(classSessions.cancelledAt),
        // Past sessions are not on /schedule either — don't expose the history.
        gt(classSessions.endTime, new Date())
      )
    );

  if (!session) {
    return NextResponse.json({ error: "Няма такъв час." }, { status: 404 });
  }

  const ics = buildSessionIcs({
    sessionId,
    title: sessionCalendarTitle(localizedSportName(session.sportName, locale)),
    start: session.startTime,
    end: session.endTime,
    description: sessionCalendarDescription(session.instructorName, locale),
    now: new Date(),
    locale,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="wheelylove-${sessionId}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
