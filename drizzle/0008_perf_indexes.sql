CREATE INDEX "idx_port_findings_ip_observed" ON "port_findings" USING btree ("ip","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_port_findings_port_observed" ON "port_findings" USING btree ("port","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_scan_runs_started" ON "scan_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_scan_runs_requested_by" ON "scan_runs" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "idx_shares_created" ON "shares" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_shodan_host_cache_expires" ON "shodan_host_cache" USING btree ("expires_at");