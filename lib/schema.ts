import { pgTable, bigserial, text, timestamp, integer, real, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const scanRuns = pgTable('scan_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  cidr: text('cidr').notNull(),
  ports: text('ports').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  scannerVersion: text('scanner_version').notNull().default('fast_scan.py'),
  scannerPid: integer('scanner_pid'),
  // JSON-encoded argv used to launch fast_scan.py, so an interrupted run can be
  // replayed verbatim by the resume-on-boot reconciler.
  scanArgs: text('scan_args'),
  notes: text('notes'),
  // Optional human-readable name/description for the scan (user-set), e.g.
  // "HQ external range". Shown on the scans list + detail.
  label: text('label'),
  // Live progress, written periodically by the scanner. progressAt doubles as a
  // heartbeat: a run with no finishedAt whose progressAt is stale is treated as
  // dead (the scanner died) rather than "running forever".
  totalTargets: integer('total_targets'),
  attemptedTargets: integer('attempted_targets'),
  openCount: integer('open_count'),
  currentIp: text('current_ip'),
  progressAt: timestamp('progress_at', { withTimezone: true }),
  // When true the run is waiting in the queue and has not been launched yet.
  // The dispatcher (lib/queue.ts) starts queued runs as concurrency slots free,
  // so heavy scans never all run at once and saturate the host.
  queued: boolean('queued').notNull().default(false),
});

export const portFindings = pgTable('port_findings', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  runId: integer('run_id').references(() => scanRuns.id, { onDelete: 'set null' }),
  ip: text('ip').notNull(),
  port: integer('port').notNull(),
  state: text('state').notNull().default('open'),
  latencyMs: real('latency_ms'),
  banner: text('banner'),
  headers: text('headers'),
  service: text('service'),
  product: text('product'),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  runIpPortUnique: uniqueIndex('uq_port_findings_run_ip_port').on(table.runId, table.ip, table.port),
  ipIdx: index('idx_port_findings_ip').on(table.ip),
  portIdx: index('idx_port_findings_port').on(table.port),
  observedIdx: index('idx_port_findings_observed').on(table.observedAt),
}));

// Better-auth tables
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// Public, read-only shareable reports. A share captures an immutable JSON
// snapshot of a scan run or a single host at share time, addressable by an
// unguessable token. Optionally password-protected, expiring, and revocable.
export const shares = pgTable('shares', {
  token: text('token').primaryKey(),
  kind: text('kind').notNull(), // 'scan' | 'host'
  refId: text('ref_id').notNull(), // scan run id (as text) or host ip
  title: text('title'),
  snapshot: text('snapshot').notNull(), // JSON-encoded frozen report data
  passwordHash: text('password_hash'), // null = no password
  expiresAt: timestamp('expires_at', { withTimezone: true }), // null = never
  revoked: boolean('revoked').notNull().default(false),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  refIdx: index('idx_shares_ref').on(table.kind, table.refId),
}));

// Persisted per-host device classification (camera / printer / firewall / …).
// Derived from a host's findings by the SQL classifier and materialized here so
// the sidebar filter, counts, and card badges are cheap index lookups instead
// of a full-table aggregation on every request. Recomputed at boot and after
// each scan completes (lib/host-devices.ts). Only non-"unknown" hosts are
// stored; an absent row means "unknown".
export const hostDevices = pgTable('host_devices', {
  ip: text('ip').primaryKey(),
  deviceType: text('device_type').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  typeIdx: index('idx_host_devices_type').on(table.deviceType),
}));

// Recurring scans: a cron-like schedule that re-runs the same target on an
// interval. The server ticks once a minute (see server.js) and enqueues a new
// scan_runs row for every schedule whose nextRunAt has passed. Options mirror
// the scan-modal knobs and are stored as JSON so new options don't need a
// migration. lastRunId links to the most recent launched run for the UI.
export const scanSchedules = pgTable('scan_schedules', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  cidr: text('cidr').notNull(),
  ports: text('ports').notNull().default('common'),
  label: text('label'),
  // JSON-encoded extra scan options (deep, fast, banner, threads, …).
  options: text('options'),
  // How often to re-run, in minutes.
  intervalMinutes: integer('interval_minutes').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull().defaultNow(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastRunId: integer('last_run_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  dueIdx: index('idx_scan_schedules_due').on(table.enabled, table.nextRunAt),
}));

// Subnets that must never be scanned. Enforced at scan-creation time (a request
// fully inside a skip subnet is rejected) and passed to the scanner as
// --exclude so partially-overlapping ranges have those addresses skipped
// entirely — no wasted probes.
export const skipSubnets = pgTable('skip_subnets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  cidr: text('cidr').notNull().unique(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ScanRun = typeof scanRuns.$inferSelect;
export type PortFinding = typeof portFindings.$inferSelect;
export type Share = typeof shares.$inferSelect;
export type HostDevice = typeof hostDevices.$inferSelect;
export type ScanSchedule = typeof scanSchedules.$inferSelect;
export type SkipSubnet = typeof skipSubnets.$inferSelect;
