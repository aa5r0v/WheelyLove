ALTER TABLE "bookings" ALTER COLUMN "payment_method" SET DEFAULT 'cash';--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "stripe_checkout_session_id";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "stripe_payment_intent_id";