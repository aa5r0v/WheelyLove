ALTER TABLE "bookings" ADD COLUMN "locale" varchar(2) DEFAULT 'bg' NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "locale" varchar(2) DEFAULT 'bg' NOT NULL;