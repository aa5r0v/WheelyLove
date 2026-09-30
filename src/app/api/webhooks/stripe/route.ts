import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports } from "@/db/schema";
import { getStripe } from "@/lib/stripe";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { cancelBookingAtomic } from "@/lib/bookings";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  const db = getDb();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookingId = Number(session.metadata?.bookingId);
    if (bookingId) {
      // Conditional update makes redelivered events idempotent: only the first one matches.
      const confirmed = await db
        .update(bookings)
        .set({
          status: "confirmed",
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id,
        })
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending")))
        .returning({ id: bookings.id });

      if (confirmed.length === 0) {
        console.warn(`Stripe webhook: booking ${bookingId} was not pending, skipping confirmation.`);
      }

      const [details] = await db
        .select({
          userEmail: bookings.userEmail,
          startTime: classSessions.startTime,
          sportName: sports.name,
          instructorName: instructors.name,
        })
        .from(bookings)
        .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
        .innerJoin(sports, eq(classSessions.sportId, sports.id))
        .innerJoin(instructors, eq(classSessions.instructorId, instructors.id))
        .where(eq(bookings.id, bookingId));

      if (confirmed.length > 0 && details) {
        await sendBookingConfirmationEmail({
          to: details.userEmail,
          sportName: details.sportName,
          instructorName: details.instructorName,
          startTime: details.startTime,
          paymentMethod: "card",
        });
      }
    }
  }

  if (
    event.type === "checkout.session.expired" ||
    event.type === "payment_intent.payment_failed"
  ) {
    const session = event.data.object as { metadata?: { bookingId?: string } };
    const bookingId = Number(session.metadata?.bookingId);
    if (bookingId) {
      await cancelBookingAtomic(bookingId);
    }
  }

  return NextResponse.json({ received: true });
}
