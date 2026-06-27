ALTER TABLE "scan_runs" ADD COLUMN IF NOT EXISTS "total_targets" integer;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD COLUMN IF NOT EXISTS "attempted_targets" integer;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD COLUMN IF NOT EXISTS "open_count" integer;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD COLUMN IF NOT EXISTS "current_ip" text;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD COLUMN IF NOT EXISTS "progress_at" timestamp with time zone;
