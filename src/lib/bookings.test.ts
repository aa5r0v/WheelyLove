import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bookings,
  classSessions,
  instructors,
  sports,
  waitlistEntries,
} from "@/db/schema";
import { cancelBookingAndNotify, getOwnBookingDetail } from "./bookings";

// Tests must never send real email/SMS (and need no provider API keys).
vi.mock("./email", () => ({
  sendBookingCancelledEmail: vi.fn(async () => {}),
  sendWaitlistSpotOpenEmail: vi.fn(async () => {}),
}));
vi.mock("./sms", () => ({ sendBookingCancelledSms: vi.fn(async () => {}) }));

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

  it("notifies the waitlist when a spot is released", async () => {
    await db
      .update(classSessions)
      .set({ capacity: 1, bookedCount: 1 })
      .where(eq(classSessions.id, sessionId));
    const [waitingBooking] = await db
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
    const [entry] = await db
      .insert(waitlistEntries)
      .values({ sessionId, userId: "test-waiter", userEmail: "waiter@example.com" })
      .returning();

    await cancelBookingAndNotify(waitingBooking.id);

    const [updatedEntry] = await db
      .select({ notifiedAt: waitlistEntries.notifiedAt })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.id, entry.id));
    expect(updatedEntry.notifiedAt).not.toBeNull();

    await db.delete(waitlistEntries).where(eq(waitlistEntries.id, entry.id));
    await db.delete(bookings).where(eq(bookings.id, waitingBooking.id));
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

describe("getOwnBookingDetail (the ?s= of /booking/success)", () => {
  const db = getDb();
  const stamp = Date.now();
  const OWNER = `own-owner-${stamp}`;
  const OTHER = `own-other-${stamp}`;
  let sportId: number, instructorId: number, sessionId: number, bookingId: number;

  beforeAll(async () => {
    const [sport] = await db
      .insert(sports)
      .values({ slug: `own-detail-sport-${stamp}`, name: "Own Detail Sport" })
      .returning();
    sportId = sport.id;
    const [instructor] = await db
      .insert(instructors)
      .values({ slug: `own-detail-instr-${stamp}`, name: "OD" })
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
        priceCents: 600,
      })
      .returning();
    sessionId = session.id;
    const [booking] = await db
      .insert(bookings)
      .values({
        sessionId,
        userId: OWNER,
        userEmail: "owner@example.com",
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

  it("returns the booking with its session details to the owner", async () => {
    const detail = await getOwnBookingDetail(OWNER, bookingId);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(bookingId);
    expect(detail!.sportName).toBe("Own Detail Sport");
    expect(detail!.startTime.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns nothing for another user's booking id (no leaking via ?s=)", async () => {
    expect(await getOwnBookingDetail(OTHER, bookingId)).toBeNull();
  });

  it("returns nothing for a non-existent booking id", async () => {
    expect(await getOwnBookingDetail(OWNER, bookingId + 1_000_000)).toBeNull();
  });
});
