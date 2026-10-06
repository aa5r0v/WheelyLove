import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { classSessions, instructors, sessionTemplates } from "@/db/schema";
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
    templateSlot: Date;
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
      templateSlot: startTime,
      endTime: new Date(startTime.getTime() + t.durationMin * 60_000),
      capacity: t.capacity,
      priceCents: t.priceCents,
    });
  }
  return plan;
}

// Idempotent, insert-only: UNIQUE (template_id, template_slot) + ON CONFLICT DO
// NOTHING. Existing sessions (booked, edited or cancelled) are never updated or
// deleted, and a cancelled session is not re-created.
//
// Selection and insertion run in ONE transaction whose first statement locks
// the instructors rows FOR UPDATE in ascending id order, so generation
// serializes with archive/link (they lock the same rows first) instead of
// racing: either generation commits and a later archive preserves the created
// classes, or an archive commits while the locking select waits — under READ
// COMMITTED the predicate is re-checked against the latest committed row
// version after the wait, the instructor no longer matches and nothing is
// inserted for them.
export async function generateSessions(opts?: {
  weeks?: number;
  now?: Date;
  templateIds?: number[];
}) {
  const weeks = opts?.weeks ?? DEFAULT_GENERATE_WEEKS;
  const now = opts?.now ?? new Date();
  const db = getDb();

  return db.transaction(async (tx) => {
    const templates = await tx
      .select({
        id: sessionTemplates.id,
        sportId: sessionTemplates.sportId,
        instructorId: sessionTemplates.instructorId,
        weekday: sessionTemplates.weekday,
        startTime: sessionTemplates.startTime,
        durationMin: sessionTemplates.durationMin,
        capacity: sessionTemplates.capacity,
        priceCents: sessionTemplates.priceCents,
      })
      .from(sessionTemplates)
      .innerJoin(instructors, eq(sessionTemplates.instructorId, instructors.id))
      .where(
        and(
          eq(sessionTemplates.active, true),
          isNull(instructors.archivedAt),
          opts?.templateIds
            ? inArray(sessionTemplates.id, opts.templateIds)
            : undefined
        )
      )
      .orderBy(asc(instructors.id))
      .for("update", { of: instructors });

    if (templates.length === 0) return { created: 0, planned: 0 };

    // Only the instructors rows are locked by the query above; each joined
    // template row comes from that statement's snapshot and may predate a
    // concurrent archive's UPDATE ... SET active = false. Re-read the flags in
    // a fresh statement while the instructor locks are held and keep only
    // templates that are still active.
    const stillActive = await tx
      .select({ id: sessionTemplates.id })
      .from(sessionTemplates)
      .where(
        and(
          inArray(sessionTemplates.id, templates.map((t) => t.id)),
          eq(sessionTemplates.active, true)
        )
      );
    const activeIds = new Set(stillActive.map((r) => r.id));

    const rows = templates
      .filter((t) => activeIds.has(t.id))
      .flatMap((t) => planSessions(t, now, weeks));
    if (rows.length === 0) return { created: 0, planned: 0 };

    const inserted = await tx
      .insert(classSessions)
      .values(rows)
      .onConflictDoNothing({ target: [classSessions.templateId, classSessions.templateSlot] })
      .returning({ id: classSessions.id });
    return { created: inserted.length, planned: rows.length };
  });
}
