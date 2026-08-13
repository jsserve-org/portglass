CREATE TABLE "cli_device_codes" (
	"device_code" text PRIMARY KEY NOT NULL,
	"user_code" text NOT NULL,
	"device_name" text NOT NULL,
	"platform" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cli_device_codes_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "cli_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"name" text NOT NULL,
	"platform" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cli_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "shodan_host_cache" (
	"ip" text PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shodan_lookup_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"run_id" integer,
	"status" text NOT NULL,
	"error" text,
	"queried_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scan_runs" ADD COLUMN "cli_device_id" text;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD COLUMN "requested_by" text;--> statement-breakpoint
ALTER TABLE "cli_device_codes" ADD CONSTRAINT "cli_device_codes_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cli_devices" ADD CONSTRAINT "cli_devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shodan_lookup_log" ADD CONSTRAINT "shodan_lookup_log_run_id_scan_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scan_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cli_device_codes_expires" ON "cli_device_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_cli_devices_user" ON "cli_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_shodan_lookup_log_run" ON "shodan_lookup_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_shodan_lookup_log_ip" ON "shodan_lookup_log" USING btree ("ip");