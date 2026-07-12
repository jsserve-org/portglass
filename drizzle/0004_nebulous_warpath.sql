CREATE TABLE "host_devices" (
	"ip" text PRIMARY KEY NOT NULL,
	"device_type" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_host_devices_type" ON "host_devices" USING btree ("device_type");