import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions, instructors, sessionTemplates, sports } from "@/db/schema";
import { generateSessions, isoWeekday, planSessions, type TemplateRow } from "./schedule-generator";

// Europe/Sofia: DST ends on the last Sunday of October (2026-10-25, 04:00 EEST -> 03:00 EET).
const NOW = new Date("2026-10-12T00:00:00Z"); // a Monday

function tpl(over: Partial<TemplateRow>): TemplateRow {
  return {
    id: 1,
    sportId: 1,
    instructorId: 1,
    weekday: 7,
    startTime: "08:30",
    durationMin: 45,
    capacity: 12,
    priceCents: 600,
    ...over,
  };
}

describe("planSessions (pure)", () => {
  it("isoWeekday: Monday=1, Sunday=7", () => {
    expect(isoWeekday("2026-10-12")).toBe(1);
    expect(isoWeekday("2026-10-25")).toBe(7);
  });

  it("keeps the Sofia wall clock across the October DST change (UTC offset moves +3 -> +2)", () => {
    const plan = planSessions(tpl({ weekday: 7, startTime: "08:30" }), NOW, 3);
    expect(plan.map((p) => p.startTime.toISOString())).toEqual([
      "2026-10-18T05:30:00.000Z", // EEST, UTC+3
      "2026-10-25T06:30:00.000Z", // EET, UTC+2 (DST ended that night)
      "2026-11-01T06:30:00.000Z",
    ]);
    expect(plan[1].endTime.toISOString()).toBe("2026-10-25T07:15:00.000Z");
  });

  it("weekday that straddles the change: Mon 18:15 before and after", () => {
    const plan = planSessions(tpl({ weekday: 1, startTime: "18:15" }), NOW, 3);
    expect(plan.map((p) => p.startTime.toISOString())).toEqual([
      "2026-10-12T15:15:00.000Z", // 18:15 EEST, today but still in the future at NOW
      "2026-10-19T15:15:00.000Z",
      "2026-10-26T16:15:00.000Z", // 18:15 EET
    ]);
  });

  it("skips occurrences that already started", () => {
    const late = new Date("2026-10-12T16:00:00Z"); // after 18:15 Sofia
    const plan = planSessions(tpl({ weekday: 1, startTime: "18:15" }), late, 1);
    expect(plan).toEqual([]);
  });
});

describe("generateSessions (database)", () => {
  const db = getDb();
  const stamp = Date.now();
  let sportId: number;
  let instructorId: number;
  const templateIds: number[] = [];

  async function makeTemplate(over: Partial<typeof sessionTemplates.$inferInsert> = {}) {
    const [t] = await db
      .insert(sessionTemplates)
      .values({
        sportId,
        instructorId,
        weekday: 7,
        startTime: "08:30",
        durationMin: 45,
        capacity: 10,
        priceCents: 600,
        ...over,
      })
      .returning();
    templateIds.push(t.id);
    return t;
  }

  beforeAll(async () => {
    const [s] = await db
      .insert(sports)
      .values({ slug: `gen-sport-${stamp}`, name: "Gen Sport", color: "#000000" })
      .returning();
    sportId = s.id;
    const [i] = await db
      .insert(instructors)
      .values({ slug: `gen-instr-${stamp}`, name: "Gen Instructor" })
      .returning();
    instructorId = i.id;
  });

  afterAll(async () => {
    const sess = await db
      .select({ id: classSessions.id })
      .from(classSessions)
      .where(eq(classSessions.sportId, sportId));
    const ids = sess.map((x) => x.id);
    if (ids.length) await db.delete(bookings).where(inArray(bookings.sessionId, ids));
    await db.delete(classSessions).where(eq(classSessions.sportId, sportId));
    await db.delete(sessionTemplates).where(eq(sessionTemplates.sportId, sportId));
    await db.delete(instructors).where(eq(instructors.id, instructorId));
    await db.delete(sports).where(eq(sports.id, sportId));
  });

  it("is idempotent: a second run creates nothing and does not duplicate", async () => {
    const t = await makeTemplate();
    const first = await generateSessions({ now: NOW, weeks: 3, templateIds: [t.id] });
    expect(first.created).toBe(3);
    const second = await generateSessions({ now: NOW, weeks: 3, templateIds: [t.id] });
    expect(second.created).toBe(0);
    const rows = await db.select().from(classSessions).where(eq(classSessions.templateId, t.id));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.startTime.toISOString()).sort()).toEqual([
      "2026-10-18T05:30:00.000Z",
      "2026-10-25T06:30:00.000Z",
      "2026-11-01T06:30:00.000Z",
    ]);
  });

  it("never touches sessions that have bookings (nor edited or cancelled ones)", async () => {
    const t = await makeTemplate({ weekday: 3, startTime: "18:00" });
    await generateSessions({ now: NOW, weeks: 2, templateIds: [t.id] });
    const before = await db
      .select()
      .from(classSessions)
      .where(eq(classSessions.templateId, t.id))
      .orderBy(classSessions.startTime);
    expect(before).toHaveLength(2);
    const [booked, cancelled] = before;

    await db
      .update(classSessions)
      .set({ bookedCount: 1, capacity: 5, priceCents: 1234 })
      .where(eq(classSessions.id, booked.id));
    await db.insert(bookings).values({
      sessionId: booked.id,
      userId: `gen-user-${stamp}`,
      userEmail: "gen@test.local",
      userPhone: "+359000000",
      status: "confirmed",
    });
    await db.update(classSessions).set({ cancelledAt: new Date() }).where(eq(classSessions.id, cancelled.id));

    // The template changes afterwards: new capacity/price must not leak into existing rows.
    await db.update(sessionTemplates).set({ capacity: 99, priceCents: 1 }).where(eq(sessionTemplates.id, t.id));
    const again = await generateSessions({ now: NOW, weeks: 2, templateIds: [t.id] });
    expect(again.created).toBe(0);

    const after = await db
      .select()
      .from(classSessions)
      .where(eq(classSessions.templateId, t.id))
      .orderBy(classSessions.startTime);
    expect(after).toHaveLength(2);
    expect(after[0]).toMatchObject({ id: booked.id, bookedCount: 1, capacity: 5, priceCents: 1234, cancelledAt: null });
    expect(after[1].id).toBe(cancelled.id);
    expect(after[1].cancelledAt).not.toBeNull(); // cancelled stays cancelled, not re-created
    const bk = await db.select().from(bookings).where(eq(bookings.sessionId, booked.id));
    expect(bk).toHaveLength(1);
  });

  it("a class moved by hand is not re-created at its old time by the next generate", async () => {
    const t = await makeTemplate({ weekday: 2, startTime: "18:00" });
    await generateSessions({ now: NOW, weeks: 1, templateIds: [t.id] });
    const [s] = await db.select().from(classSessions).where(eq(classSessions.templateId, t.id));
    // The admin moves it one hour later (what updateSession does).
    const moved = new Date(s.startTime.getTime() + 60 * 60_000);
    await db.update(classSessions).set({ startTime: moved }).where(eq(classSessions.id, s.id));

    const again = await generateSessions({ now: NOW, weeks: 1, templateIds: [t.id] });
    expect(again.created).toBe(0);
    const rows = await db.select().from(classSessions).where(eq(classSessions.templateId, t.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].startTime.toISOString()).toBe(moved.toISOString());
  });

  it("ignores inactive templates", async () => {
    const t = await makeTemplate({ weekday: 5, active: false });
    const r = await generateSessions({ now: NOW, weeks: 2, templateIds: [t.id] });
    expect(r.created).toBe(0);
  });
});
