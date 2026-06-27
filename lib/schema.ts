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
  // Live progress, written periodically by the scanner. progressAt doubles as a
  // heartbeat: a run with no finishedAt whose progressAt is stale is treated as
  // dead (the scanner died) rather than "running forever".
  totalTargets: integer('total_targets'),
  attemptedTargets: integer('attempted_targets'),
  openCount: integer('open_count'),
  currentIp: text('current_ip'),
  progressAt: timestamp('progress_at', { withTimezone: true }),
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

export type ScanRun = typeof scanRuns.$inferSelect;
export type PortFinding = typeof portFindings.$inferSelect;
export type Share = typeof shares.$inferSelect;
