CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."gallery_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('card', 'cash');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"user_email" varchar(256) NOT NULL,
	"user_phone" varchar(32) NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'card' NOT NULL,
	"stripe_checkout_session_id" varchar(256),
	"stripe_payment_intent_id" varchar(256),
	"reminder_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"sport_id" integer NOT NULL,
	"instructor_id" integer NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"capacity" integer DEFAULT 12 NOT NULL,
	"booked_count" integer DEFAULT 0 NOT NULL,
	"price_cents" integer NOT NULL,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "gallery_type" NOT NULL,
	"url" text NOT NULL,
	"caption" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instructors" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"bio" text DEFAULT '',
	"photo_url" text,
	"email" varchar(256),
	"phone" varchar(32),
	"specialties" varchar(256) DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "instructors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sports" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"color" varchar(32) DEFAULT '#6366f1' NOT NULL,
	"description" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sports_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"user_email" varchar(256) NOT NULL,
	"notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_session_user_idx" ON "waitlist_entries" USING btree ("session_id","user_id");