import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports } from "@/db/schema";
import { cancelBookingAndNotify } from "./bookings";

describe("cancelBookingAndNotify", () => {
  const db = getDb();
  let sportId: number;
  let instructorId: number;
  let sessionId: number;
  let bookingId: number;

  beforeAll(async () => {
    const [sport] = await db
      .insert(sports)
      .values({ slug: `test-cancel-sport-${Date.now()}`, name: "Test Sport" })
      .returning();
    sportId = sport.id;

    const [instructor] = await db
      .insert(instructors)
      .values({
        slug: `test-cancel-instructor-${Date.now()}`,
        name: "Test Instructor",
      })
      .returning();
    instructorId = instructor.id;

    const [session] = await db
      .insert(classSessions)
      .values({
        sportId,
        instructorId,
        startTime: new Date(Date.now() + 86400000),
        endTime: new Date(Date.now() + 90000000),
        capacity: 5,
        bookedCount: 1,
        priceCents: 600,
      })
      .returning();
    sessionId = session.id;

    const [booking] = await db
      .insert(bookings)
      .values({
        sessionId,
        userId: "test-user",
        userEmail: "test@example.com",
        userPhone: "+359000000000",
        status: "pending",
        paymentMethod: "cash",
      })
      .returning();
    bookingId = booking.id;
  });

  afterAll(async () => {
    await db.delete(bookings).where(eq(bookings.id, bookingId));
    await db.delete(classSessions).where(eq(classSessions.id, sessionId));
    await db.delete(instructors).where(eq(instructors.id, instructorId));
    await db.delete(sports).where(eq(sports.id, sportId));
  });

  it("marks the booking cancelled and releases the session spot", async () => {
    await cancelBookingAndNotify(bookingId);

    const [updatedBooking] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(updatedBooking.status).toBe("cancelled");

    const [updatedSession] = await db
      .select({ bookedCount: classSessions.bookedCount })
      .from(classSessions)
      .where(eq(classSessions.id, sessionId));
    expect(updatedSession.bookedCount).toBe(0);
  });

  it("is a no-op when called again on an already-cancelled booking", async () => {
    await cancelBookingAndNotify(bookingId);

    const [updatedSession] = await db
      .select({ bookedCount: classSessions.bookedCount })
      .from(classSessions)
      .where(eq(classSessions.id, sessionId));
    expect(updatedSession.bookedCount).toBe(0);
  });
});
