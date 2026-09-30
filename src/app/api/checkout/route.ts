import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { and, count, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { formatDateTimeShort } from "@/lib/format";
import { normalizeBgPhone } from "@/lib/phone";
import {
  bookings,
  classSessions,
  instructors,
  sports,
  waitlistEntries,
} from "@/db/schema";
import { getStripe } from "@/lib/stripe";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { cancelBookingAtomic } from "@/lib/bookings";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_BOOKINGS = 5;

function isUniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Неоторизиран достъп." }, { status: 401 });
  }

  let payload: { sessionId?: unknown; phone?: unknown; paymentMethod?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалидна заявка." }, { status: 400 });
  }
  const { sessionId, phone: rawPhone, paymentMethod } = payload;
  if (
    typeof sessionId !== "number" ||
    !Number.isInteger(sessionId) ||
    typeof rawPhone !== "string" ||
    (paymentMethod !== "card" && paymentMethod !== "cash")
  ) {
    return NextResponse.json({ error: "Невалидна заявка." }, { status: 400 });
  }

  const phone = normalizeBgPhone(rawPhone);
  if (!phone) {
    return NextResponse.json(
      { error: "Невалиден телефонен номер. Използвай български номер (+359… или 08…)." },
      { status: 400 }
    );
  }

  if (paymentMethod === "card") {
    return NextResponse.json(
      { error: "Плащането с карта все още не е налично." },
      { status: 400 }
    );
  }

  const db = getDb();
  const [session] = await db
    .select({
      id: classSessions.id,
      startTime: classSessions.startTime,
      capacity: classSessions.capacity,
      priceCents: classSessions.priceCents,
      cancelledAt: classSessions.cancelledAt,
      sportName: sports.name,
      instructorName: instructors.name,
    })
    .from(classSessions)
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .innerJoin(instructors, eq(classSessions.instructorId, instructors.id))
    .where(eq(classSessions.id, sessionId));

  if (!session || session.cancelledAt) {
    return NextResponse.json({ error: "Часът не съществува." }, { status: 404 });
  }
  if (session.startTime.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Часът вече е започнал или е минал." }, { status: 400 });
  }

  const [existingBooking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.sessionId, session.id),
        eq(bookings.userId, user.id),
        inArray(bookings.status, ["pending", "confirmed"])
      )
    );
  if (existingBooking) {
    return NextResponse.json({ error: "Вече имаш резервация за този час." }, { status: 409 });
  }

  const [{ recent }] = await db
    .select({ recent: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, user.id),
        gte(bookings.createdAt, new Date(Date.now() - RATE_LIMIT_WINDOW_MS))
      )
    );
  if (recent >= RATE_LIMIT_MAX_BOOKINGS) {
    return NextResponse.json(
      { error: "Твърде много опити за резервация. Опитайте отново по-късно." },
      { status: 429 }
    );
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  // Claim the spot and create the booking in one transaction: a failing insert rolls the
  // bookedCount increment back, so no spot can leak.
  let booking: typeof bookings.$inferSelect | null;
  try {
    booking = await db.transaction(async (tx) => {
      // Atomic: only claims a spot if capacity allows it, immune to concurrent requests.
      const [claimed] = await tx
        .update(classSessions)
        .set({ bookedCount: sql`${classSessions.bookedCount} + 1` })
        .where(
          and(
            eq(classSessions.id, session.id),
            isNull(classSessions.cancelledAt),
            gt(classSessions.startTime, new Date()),
            sql`${classSessions.bookedCount} < ${classSessions.capacity}`
          )
        )
        .returning({ id: classSessions.id });
      if (!claimed) return null;

      const [inserted] = await tx
        .insert(bookings)
        .values({
          sessionId: session.id,
          userId: user.id,
          userEmail: email,
          userPhone: phone,
          status: "pending",
          paymentMethod,
        })
        .returning();

      await tx
        .delete(waitlistEntries)
        .where(
          and(eq(waitlistEntries.sessionId, session.id), eq(waitlistEntries.userId, user.id))
        );
      return inserted;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "Вече имаш резервация за този час." }, { status: 409 });
    }
    throw err;
  }

  if (!booking) {
    return NextResponse.json({ error: "Няма свободни места." }, { status: 409 });
  }

  if (paymentMethod === "cash") {
    await sendBookingConfirmationEmail({
      to: email,
      sportName: session.sportName,
      instructorName: session.instructorName,
      startTime: session.startTime,
      paymentMethod: "cash",
    });
    return NextResponse.json({ ok: true });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
    if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not set");
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email || undefined,
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: session.priceCents,
            product_data: {
              name: `${session.sportName} — ${formatDateTimeShort(session.startTime)}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { bookingId: String(booking.id) },
      success_url: `${appUrl}/booking/success?booking=${booking.id}`,
      cancel_url: `${appUrl}/`,
    });

    await db
      .update(bookings)
      .set({ stripeCheckoutSessionId: checkoutSession.id })
      .where(eq(bookings.id, booking.id));

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    // Stripe failed to create the session — release the claimed spot and the booking row.
    await cancelBookingAtomic(booking.id);
    console.error("Failed to create Stripe checkout session:", err);
    return NextResponse.json(
      { error: "Грешка при създаване на плащане. Опитайте отново." },
      { status: 500 }
    );
  }
}
