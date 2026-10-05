CREATE TYPE "public"."booking_attendance" AS ENUM('unknown', 'attended', 'no_show');--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "attendance" "booking_attendance" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "instructors" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_user_id_unique" UNIQUE("user_id");