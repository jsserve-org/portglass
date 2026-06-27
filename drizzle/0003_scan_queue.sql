ALTER TABLE "scan_runs" ADD COLUMN IF NOT EXISTS "queued" boolean DEFAULT false NOT NULL;
