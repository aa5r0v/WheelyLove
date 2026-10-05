import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { classSessions, instructors, sports } from "@/db/schema";
import { fromSofiaDateTime } from "./format";
import {
  dayRange,
  getDaySessions,
  getDaysWithSessions,
  occupancyOf,
  resolveDate,
  scheduleDates,
} from "./schedule";

const NOW = new Date("2026-10-12T09:00:00Z");

describe("pure helpers", () => {
  it("scheduleDates returns today + the next 13 Sofia days", () => {
    const d = scheduleDates(NOW);
    expect(d).toHaveLength(14);
    expect(d[0]).toBe("2026-10-12");
    expect(d[13]).toBe("2026-10-25");
  });

  it("scheduleDates uses the Sofia date, not the UTC date (23:30Z is already tomorrow in Sofia)", () => {
    expect(scheduleDates(new Date("2026-10-12T21:30:00Z"))[0]).toBe("2026-10-13");
  });

  it("resolveDate falls back to today for junk or out-of-window dates", () => {
    expect(resolveDate("2026-10-20", NOW)).toBe("2026-10-20");
    expect(resolveDate("2026-10-26", NOW)).toBe("2026-10-12");
    expect(resolveDate("2026-10-11", NOW)).toBe("2026-10-12");
    expect(resolveDate("nonsense", NOW)).toBe("2026-10-12");
    expect(resolveDate(undefined, NOW)).toBe("2026-10-12");
  });

  it("occupancyOf: free / almost (<=3 left and at least half taken) / full", () => {
    expect(occupancyOf(7, 12)).toBe("free");
    expect(occupancyOf(4, 12)).toBe("free");
    expect(occupancyOf(3, 12)).toBe("almost");
    expect(occupancyOf(1, 12)).toBe("almost");
    expect(occupancyOf(0, 12)).toBe("full");
    expect(occupancyOf(-1, 12)).toBe("full");
  });

  it("occupancyOf: a small, mostly empty class is not 'almost full'", () => {
    expect(occupancyOf(3, 3)).toBe("free"); // nobody booked yet
    expect(occupancyOf(2, 3)).toBe("free"); // 1 of 3 taken
    expect(occupancyOf(1, 3)).toBe("almost"); // 2 of 3 taken
    expect(occupancyOf(2, 4)).toBe("almost"); // half taken
  });

  it("dayRange is 25 hours on the day DST ends", () => {
    const { from, to } = dayRange("2026-10-25");
    expect((to.getTime() - from.getTime()) / 3_600_000).toBe(25);
  });
});

describe("getDaySessions (database)", () => {
  const db = getDb();
  const stamp = Date.now();
  let sportA: number, sportB: number, instrA: number, instrB: number;
  const at = (date: string, time: string) => fromSofiaDateTime(date, time);

  async function add(
    sportId: number,
    instructorId: number,
    date: string,
    time: string,
    over: Partial<typeof classSessions.$inferInsert> = {}
  ) {
    const startTime = at(date, time);
    const [r] = await db
      .insert(classSessions)
      .values({
        sportId,
        instructorId,
        startTime,
        endTime: new Date(startTime.getTime() + 45 * 60_000),
        capacity: 10,
        bookedCount: 0,
        priceCents: 600,
        ...over,
      })
      .returning();
    return r;
  }

  const ids: Record<string, number> = {};

  beforeAll(async () => {
    [{ id: sportA }] = await db
      .insert(sports)
      .values({ slug: `sch-a-${stamp}`, name: "Sch A", color: "#111111" })
      .returning();
    [{ id: sportB }] = await db
      .insert(sports)
      .values({ slug: `sch-b-${stamp}`, name: "Sch B", color: "#222222" })
      .returning();
    [{ id: instrA }] = await db.insert(instructors).values({ slug: `sch-ia-${stamp}`, name: "IA" }).returning();
    [{ id: instrB }] = await db.insert(instructors).values({ slug: `sch-ib-${stamp}`, name: "IB" }).returning();

    ids.a = (await add(sportA, instrA, "2026-10-20", "18:00", { capacity: 10, bookedCount: 3 })).id;
    ids.full = (await add(sportB, instrB, "2026-10-20", "09:00", { capacity: 2, bookedCount: 2 })).id;
    ids.cancelled = (await add(sportA, instrA, "2026-10-20", "12:00", { cancelledAt: new Date() })).id;
    ids.lastMinute = (await add(sportA, instrB, "2026-10-20", "23:59")).id;
    ids.nextDayMidnight = (await add(sportA, instrA, "2026-10-21", "00:00")).id;
    ids.dstLate = (await add(sportA, instrA, "2026-10-25", "23:30")).id; // 21:30Z, still the 25th in Sofia
    ids.dstNextDay = (await add(sportA, instrA, "2026-10-26", "00:30")).id; // 22:30Z on the 25th, but the 26th in Sofia
  });

  afterAll(async () => {
    await db.delete(classSessions).where(eq(classSessions.sportId, sportA));
    await db.delete(classSessions).where(eq(classSessions.sportId, sportB));
    await db.delete(instructors).where(eq(instructors.id, instrA));
    await db.delete(instructors).where(eq(instructors.id, instrB));
    await db.delete(sports).where(eq(sports.id, sportA));
    await db.delete(sports).where(eq(sports.id, sportB));
  });

  const mine = (rows: { id: number }[]) => rows.map((r) => r.id).filter((id) => Object.values(ids).includes(id));

  it("returns the day's sessions in time order with free places, excluding cancelled and other days", async () => {
    const rows = await getDaySessions("2026-10-20", {}, NOW);
    expect(mine(rows)).toEqual([ids.full, ids.a, ids.lastMinute]);
    const a = rows.find((r) => r.id === ids.a)!;
    expect(a).toMatchObject({ capacity: 10, bookedCount: 3, spotsLeft: 7, occupancy: "free", durationMin: 45 });
    expect(a.sportName).toBe("Sch A");
    expect(a.instructorName).toBe("IA");
    const full = rows.find((r) => r.id === ids.full)!;
    expect(full).toMatchObject({ spotsLeft: 0, occupancy: "full" });
  });

  it("uses Sofia calendar days: 00:00 next day is excluded, 23:59 is included", async () => {
    expect(mine(await getDaySessions("2026-10-20", {}, NOW))).toContain(ids.lastMinute);
    expect(mine(await getDaySessions("2026-10-20", {}, NOW))).not.toContain(ids.nextDayMidnight);
    expect(mine(await getDaySessions("2026-10-21", {}, NOW))).toEqual([ids.nextDayMidnight]);
  });

  it("assigns sessions near midnight on the DST-change day to the right Sofia date", async () => {
    expect(mine(await getDaySessions("2026-10-25", {}, NOW))).toEqual([ids.dstLate]);
    expect(mine(await getDaySessions("2026-10-26", {}, NOW))).toEqual([ids.dstNextDay]);
  });

  it("filters by sport and by instructor", async () => {
    expect(mine(await getDaySessions("2026-10-20", { sportSlug: `sch-b-${stamp}` }, NOW))).toEqual([ids.full]);
    expect(mine(await getDaySessions("2026-10-20", { instructorSlug: `sch-ib-${stamp}` }, NOW))).toEqual([
      ids.full,
      ids.lastMinute,
    ]);
    expect(
      mine(await getDaySessions("2026-10-20", { sportSlug: `sch-a-${stamp}`, instructorSlug: `sch-ib-${stamp}` }, NOW))
    ).toEqual([ids.lastMinute]);
  });

  it("does not list sessions that already started", async () => {
    const late = new Date(at("2026-10-20", "12:00").getTime());
    expect(mine(await getDaySessions("2026-10-20", {}, late))).toEqual([ids.a, ids.lastMinute]);
  });

  it("getDaysWithSessions marks days that have upcoming sessions", async () => {
    const days = await getDaysWithSessions(scheduleDates(NOW), { sportSlug: `sch-a-${stamp}` }, NOW);
    expect(days.has("2026-10-20")).toBe(true);
    expect(days.has("2026-10-21")).toBe(true);
    expect(days.has("2026-10-25")).toBe(true);
    expect(days.has("2026-10-22")).toBe(false);
  });
});
