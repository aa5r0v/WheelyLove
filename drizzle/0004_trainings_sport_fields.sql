CREATE TYPE "public"."sport_level" AS ENUM('all', 'beginner', 'intermediate', 'advanced');--> statement-breakpoint
ALTER TABLE "sports" ADD COLUMN "level" "sport_level" DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "sports" ADD COLUMN "default_duration_min" integer;--> statement-breakpoint
ALTER TABLE "sports" ADD COLUMN "default_price_cents" integer;--> statement-breakpoint
ALTER TABLE "sports" ADD COLUMN "default_capacity" integer DEFAULT 12 NOT NULL;