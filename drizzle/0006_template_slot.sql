ALTER TABLE "class_sessions" ADD COLUMN "template_slot" timestamp;--> statement-breakpoint
-- Already generated sessions: their planned slot is their current start time.
UPDATE "class_sessions" SET "template_slot" = "start_time" WHERE "template_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "class_sessions_template_slot_idx" ON "class_sessions" USING btree ("template_id","template_slot");--> statement-breakpoint
DROP INDEX "class_sessions_template_start_idx";
