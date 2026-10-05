import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { classSessions, sessionTemplates } from "@/db/schema";
import { fromSofiaDateTime, toSofiaDateInput } from "./format";

export const DEFAULT_GENERATE_WEEKS = 8;

// ISO weekday (1 = Monday ... 7 = Sunday) of a "YYYY-MM-DD" calendar date.
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return js === 0 ? 7 : js;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export type TemplateRow = {
  id: number;
  sportId: number;
  instructorId: number;
  weekday: number;
  startTime: string; // "HH:MM", Europe/Sofia wall clock
  durationMin: number;
  capacity: number;
  priceCents: number;
};

// Pure: the concrete sessions a template yields in [today, today + weeks) Sofia
// calendar days. The start is built from the Sofia wall clock, so DST changes
// never shift the local hour. Sessions that already started are skipped.
export function planSessions(t: TemplateRow, now: Date, weeks: number) {
  const today = toSofiaDateInput(now);
  const plan: {
    templateId: number;
    sportId: number;
    instructorId: number;
    startTime: Date;
    endTime: Date;
    capacity: number;
    priceCents: number;
  }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(today, i);
    if (isoWeekday(date) !== t.weekday) continue;
    const startTime = fromSofiaDateTime(date, t.startTime);
    if (startTime.getTime() <= now.getTime()) continue;
    plan.push({
      templateId: t.id,
      sportId: t.sportId,
      instructorId: t.instructorId,
      startTime,
      endTime: new Date(startTime.getTime() + t.durationMin * 60_000),
      capacity: t.capacity,
      priceCents: t.priceCents,
    });
  }
  return plan;
}

// Idempotent, insert-only: UNIQUE (template_id, start_time) + ON CONFLICT DO
// NOTHING. Existing sessions (booked, edited or cancelled) are never updated or
// deleted, and a cancelled session is not re-created.
export async function generateSessions(opts?: {
  weeks?: number;
  now?: Date;
  templateIds?: number[];
}) {
  const weeks = opts?.weeks ?? DEFAULT_GENERATE_WEEKS;
  const now = opts?.now ?? new Date();
  const db = getDb();

  const templates = await db
    .select()
    .from(sessionTemplates)
    .where(
      opts?.templateIds
        ? and(eq(sessionTemplates.active, true), inArray(sessionTemplates.id, opts.templateIds))
        : eq(sessionTemplates.active, true)
    );

  const rows = templates.flatMap((t) => planSessions(t, now, weeks));
  if (rows.length === 0) return { created: 0, planned: 0 };

  const inserted = await db
    .insert(classSessions)
    .values(rows)
    .onConflictDoNothing({ target: [classSessions.templateId, classSessions.startTime] })
    .returning({ id: classSessions.id });
  return { created: inserted.length, planned: rows.length };
}
