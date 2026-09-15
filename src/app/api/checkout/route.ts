import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports } from "@/db/schema";
import { getStripe } from "@/lib/stripe";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { sendBookingConfirmationSms } from "@/lib/sms";
import { releaseSessionSpot } from "@/lib/bookings";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Неоторизиран достъп." }, { status: 401 });
  }

  const { sessionId, phone, paymentMethod } = await req.json();
  if (
    typeof sessionId !== "number" ||
    typeof phone !== "string" ||
    !phone.trim() ||
    (paymentMethod !== "card" && paymentMethod !== "cash")
  ) {
    return NextResponse.json({ error: "Невалидна заявка." }, { status: 400 });
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

  // Atomic: only claims a spot if capacity allows it, immune to concurrent requests.
  const [claimed] = await db
    .update(classSessions)
    .set({ bookedCount: sql`${classSessions.bookedCount} + 1` })
    .where(
      sql`${classSessions.id} = ${sessionId} and ${classSessions.bookedCount} < ${classSessions.capacity}`
    )
    .returning({ id: classSessions.id });

  if (!claimed) {
    return NextResponse.json({ error: "Няма свободни места." }, { status: 409 });
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  const [booking] = await db
    .insert(bookings)
    .values({
      sessionId: session.id,
      userId: user.id,
      userEmail: email,
      userPhone: phone.trim(),
      status: "pending",
      paymentMethod,
    })
    .returning();

  if (paymentMethod === "cash") {
    await Promise.all([
      sendBookingConfirmationEmail({
        to: email,
        sportName: session.sportName,
        instructorName: session.instructorName,
        startTime: session.startTime,
        paymentMethod: "cash",
      }),
      sendBookingConfirmationSms({
        to: phone.trim(),
        sportName: session.sportName,
        startTime: session.startTime,
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  try {
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
              name: `${session.sportName} — ${session.startTime.toLocaleString("bg-BG")}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { bookingId: String(booking.id) },
      success_url: `${origin}/booking/success?booking=${booking.id}`,
      cancel_url: `${origin}/`,
    });

    await db
      .update(bookings)
      .set({ stripeCheckoutSessionId: checkoutSession.id })
      .where(eq(bookings.id, booking.id));

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    // Stripe failed to create the session — release the claimed spot and the booking row.
    await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, booking.id));
    await releaseSessionSpot(session.id);
    console.error("Failed to create Stripe checkout session:", err);
    return NextResponse.json(
      { error: "Грешка при създаване на плащане. Опитайте отново." },
      { status: 500 }
    );
  }
}
