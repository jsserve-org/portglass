import { pgTable, bigserial, text, timestamp, integer, real, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const scanRuns = pgTable('scan_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  cidr: text('cidr').notNull(),
  ports: text('ports').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  scannerVersion: text('scanner_version').notNull().default('fast_scan.py'),
  notes: text('notes'),
});

export const portFindings = pgTable('port_findings', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  runId: integer('run_id').references(() => scanRuns.id, { onDelete: 'set null' }),
  ip: text('ip').notNull(),
  port: integer('port').notNull(),
  state: text('state').notNull().default('open'),
  latencyMs: real('latency_ms'),
  banner: text('banner'),
  service: text('service'),
  product: text('product'),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  runIpPortUnique: uniqueIndex('uq_port_findings_run_ip_port').on(table.runId, table.ip, table.port),
  ipIdx: index('idx_port_findings_ip').on(table.ip),
  portIdx: index('idx_port_findings_port').on(table.port),
  observedIdx: index('idx_port_findings_observed').on(table.observedAt),
}));

export type ScanRun = typeof scanRuns.$inferSelect;
export type PortFinding = typeof portFindings.$inferSelect;
