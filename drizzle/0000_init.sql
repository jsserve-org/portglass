-- Baseline migration. This is intentionally idempotent (IF NOT EXISTS /
-- guarded ADD CONSTRAINT) because it is applied to databases that were
-- originally bootstrapped by db/init.sql and already contain the scanner
-- tables. On a fresh database it creates everything; on an existing one it
-- only fills in what's missing (notably the better-auth tables). Migrations
-- generated after this baseline are normal drizzle-kit output.
CREATE TABLE IF NOT EXISTS "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "port_findings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" integer,
	"ip" text NOT NULL,
	"port" integer NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"latency_ms" real,
	"banner" text,
	"headers" text,
	"service" text,
	"product" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scan_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cidr" text NOT NULL,
	"ports" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"scanner_version" text DEFAULT 'fast_scan.py' NOT NULL,
	"scanner_pid" integer,
	"scan_args" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "port_findings" ADD CONSTRAINT "port_findings_run_id_scan_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scan_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_port_findings_run_ip_port" ON "port_findings" USING btree ("run_id","ip","port");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_port_findings_ip" ON "port_findings" USING btree ("ip");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_port_findings_port" ON "port_findings" USING btree ("port");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_port_findings_observed" ON "port_findings" USING btree ("observed_at");
