CREATE TABLE "scan_schedules" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cidr" text NOT NULL,
	"ports" text DEFAULT 'common' NOT NULL,
	"label" text,
	"options" text,
	"interval_minutes" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skip_subnets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cidr" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skip_subnets_cidr_unique" UNIQUE("cidr")
);
--> statement-breakpoint
CREATE INDEX "idx_scan_schedules_due" ON "scan_schedules" USING btree ("enabled","next_run_at");