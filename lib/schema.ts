import { pgTable, bigserial, text, timestamp, integer, real, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';

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

export type ScanRun = typeof scanRuns.$inferSelect;
export type PortFinding = typeof portFindings.$inferSelect;
