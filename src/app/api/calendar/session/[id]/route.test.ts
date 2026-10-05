import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports } from "@/db/schema";
import { GET } from "./route";

// The route is public and its input is only the session id — everything else
// (fixtures included) is what /schedule already shows to everyone.
const call = (id: string) =>
  GET(new Request(`http://localhost/api/calendar/session/${id}`), { params: Promise.resolve({ id }) });

describe("GET /api/calendar/session/[id]", () => {
  const db = getDb();
  const tag = `calroute-${Date.now()}`;
  let liveId: number;
  let cancelledId: number;
  let pastId: number;
  const ids: number[] = [];

  beforeAll(async () => {
    const [sport] = await db
      .insert(sports)
      .values({ slug: `${tag}-sport`, name: "Календар Спорт" })
      .returning();
    ids.push(sport.id);
    const [instructor] = await db
      .insert(instructors)
      .values({ slug: `${tag}-ins`, name: "Календар Инструктор" })
      .returning();
    ids.push(instructor.id);

    const [live] = await db
      .insert(classSessions)
      .values({
        sportId: sport.id,
        instructorId: instructor.id,
        startTime: new Date(Date.now() + 86400000),
        endTime: new Date(Date.now() + 86400000 + 45 * 60000),
        capacity: 5,
        priceCents: 600,
      })
      .returning();
    liveId = live.id;
    const [cancelled] = await db
      .insert(classSessions)
      .values({
        sportId: sport.id,
        instructorId: instructor.id,
        startTime: new Date(Date.now() + 2 * 86400000),
        endTime: new Date(Date.now() + 2 * 86400000 + 45 * 60000),
        capacity: 5,
        priceCents: 600,
        cancelledAt: new Date(),
      })
      .returning();
    cancelledId = cancelled.id;
    const [past] = await db
      .insert(classSessions)
      .values({
        sportId: sport.id,
        instructorId: instructor.id,
        startTime: new Date(Date.now() - 2 * 86400000),
        endTime: new Date(Date.now() - 2 * 86400000 + 45 * 60000),
        capacity: 5,
        priceCents: 600,
      })
      .returning();
    pastId = past.id;

    // A real booking by a user with an email — that address must never appear
    // in the public .ics body.
    await db.insert(bookings).values({
      sessionId: liveId,
      userId: `${tag}-user`,
      userEmail: `secret-${tag}@clients.example.com`,
      userPhone: "+359000000000",
      status: "pending",
      paymentMethod: "cash",
    });
  });

  afterAll(async () => {
    await db.delete(bookings).where(eq(bookings.sessionId, liveId));
    await db.delete(classSessions).where(eq(classSessions.id, liveId));
    await db.delete(classSessions).where(eq(classSessions.id, cancelledId));
    await db.delete(classSessions).where(eq(classSessions.id, pastId));
    await db.delete(instructors).where(eq(instructors.slug, `${tag}-ins`));
    await db.delete(sports).where(eq(sports.slug, `${tag}-sport`));
  });

  it("answers 404 for a non-numeric id", async () => {
    expect((await call("abc")).status).toBe(404);
  });

  it("answers 404 for zero", async () => {
    expect((await call("0")).status).toBe(404);
  });

  it("answers 404 for a negative id", async () => {
    expect((await call("-1")).status).toBe(404);
  });

  it("answers 404 (not 500) for an id beyond the int4 range", async () => {
    expect((await call("99999999999")).status).toBe(404);
  });

  it("answers 404 for a session that is already over", async () => {
    expect((await call(String(pastId))).status).toBe(404);
  });

  it("answers 404 for a non-integer id", async () => {
    expect((await call("1.5")).status).toBe(404);
  });

  it("answers 404 for an id that exists in no calendar", async () => {
    expect((await call(String(liveId + 1_000_000))).status).toBe(404);
  });

  it("answers 404 for a cancelled session", async () => {
    expect((await call(String(cancelledId))).status).toBe(404);
  });

  it("returns a downloadable text/calendar body for a live session", async () => {
    const res = await call(String(liveId));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="wheelylove-${liveId}.ics"`
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const body = await res.text();
    expect(body).toContain(`UID:session-${liveId}@wheelylove.net`);
    // The colon between property name and value is structural, never escaped.
    expect(body).not.toContain("SUMMARY:WheelyLove\\:");
    expect(body).toContain("SUMMARY:WheelyLove: Календар Спорт");
    expect(body).not.toContain("DESCRIPTION:Инструктор\\:");
    expect(body).toContain("TRIGGER:-PT2H");
  });

  it("never leaks the booker's email into the public .ics", async () => {
    const body = await (await call(String(liveId))).text();
    expect(body).not.toContain(`secret-${tag}@clients.example.com`);
  });
});
