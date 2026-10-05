-- DEFERRED migration - NOT part of ./drizzle on purpose (deploy.sh runs every
-- migration listed in drizzle/meta/_journal.json automatically).
--
-- What: drops the two leftover Stripe columns of the old checkout.
-- When: with the SECOND release of the new stack (the first release ships this
--       file but does NOT apply it - see deploy/README.md, section "Отложени
--       миграции"). Until then the columns stay in place so the first release
--       can still be rolled back to an app version that reads them.
-- How, when the time comes:
--   1. git mv deploy/deferred-migrations/deferred-drop_stripe_columns.sql drizzle/<NNNN>_drop_stripe_columns.sql
--      (<NNNN> = the next free number in drizzle/, see the journal)
--   2. add to drizzle/meta/_journal.json (entries array):
--        {
--          "idx": <next idx>,
--          "version": "7",
--          "when": <Unix time in ms at that moment>,
--          "tag": "<NNNN>_drop_stripe_columns",
--          "breakpoints": true
--        }
--   3. commit and deploy normally (deploy.sh applies it with the rest).
-- IF EXISTS keeps it idempotent on databases where the columns are already gone.

ALTER TABLE "bookings" DROP COLUMN IF EXISTS "stripe_checkout_session_id";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN IF EXISTS "stripe_payment_intent_id";
