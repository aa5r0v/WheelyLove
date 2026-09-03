import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { classSessions, instructors, sports } from "@/db/schema";

// Regression test for the overbooking race condition: two concurrent
// bookers must never both succeed in claiming the same last spot.
describe("atomic capacity claim", () => {
  const db = getDb();
  let sportId: number;
  let instructorId: number;
  let sessionId: number;

  beforeAll(async () => {
    const [sport] = await db
      .insert(sports)
      .values({
        slug: `test-sport-${Date.now()}`,
        name: "Test Sport",
        color: "#000000",
      })
      .returning();
    sportId = sport.id;

    const [instructor] = await db
      .insert(instructors)
      .values({ slug: `test-instructor-${Date.now()}`, name: "Test Instructor" })
      .returning();
    instructorId = instructor.id;

    const [session] = await db
      .insert(classSessions)
      .values({
        sportId,
        instructorId,
        startTime: new Date(Date.now() + 86400000),
        endTime: new Date(Date.now() + 90000000),
        capacity: 3,
        bookedCount: 0,
        priceCents: 600,
      })
      .returning();
    sessionId = session.id;
  });

  afterAll(async () => {
    await db.delete(classSessions).where(eq(classSessions.id, sessionId));
    await db.delete(instructors).where(eq(instructors.id, instructorId));
    await db.delete(sports).where(eq(sports.id, sportId));
  });

  it("only allows exactly `capacity` concurrent claims to succeed", async () => {
    const attempts = 10;
    const claims = await Promise.all(
      Array.from({ length: attempts }, () =>
        db
          .update(classSessions)
          .set({ bookedCount: sql`${classSessions.bookedCount} + 1` })
          .where(
            sql`${classSessions.id} = ${sessionId} and ${classSessions.bookedCount} < ${classSessions.capacity}`
          )
          .returning({ id: classSessions.id })
      )
    );

    const successCount = claims.filter((rows) => rows.length > 0).length;
    expect(successCount).toBe(3);

    const [finalSession] = await db
      .select({ bookedCount: classSessions.bookedCount })
      .from(classSessions)
      .where(eq(classSessions.id, sessionId));
    expect(finalSession.bookedCount).toBe(3);
  });
});
