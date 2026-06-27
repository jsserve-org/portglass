CREATE TABLE IF NOT EXISTS "shares" (
	"token" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"title" text,
	"snapshot" text NOT NULL,
	"password_hash" text,
	"expires_at" timestamp with time zone,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_shares_ref" ON "shares" USING btree ("kind","ref_id");