"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.portFindings = exports.scanRuns = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.scanRuns = (0, pg_core_1.pgTable)('scan_runs', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    cidr: (0, pg_core_1.text)('cidr').notNull(),
    ports: (0, pg_core_1.text)('ports').notNull(),
    startedAt: (0, pg_core_1.timestamp)('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: (0, pg_core_1.timestamp)('finished_at', { withTimezone: true }),
    scannerVersion: (0, pg_core_1.text)('scanner_version').notNull().default('fast_scan.py'),
    notes: (0, pg_core_1.text)('notes'),
});
exports.portFindings = (0, pg_core_1.pgTable)('port_findings', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    runId: (0, pg_core_1.integer)('run_id').references(() => exports.scanRuns.id, { onDelete: 'set null' }),
    ip: (0, pg_core_1.text)('ip').notNull(),
    port: (0, pg_core_1.integer)('port').notNull(),
    state: (0, pg_core_1.text)('state').notNull().default('open'),
    latencyMs: (0, pg_core_1.real)('latency_ms'),
    banner: (0, pg_core_1.text)('banner'),
    service: (0, pg_core_1.text)('service'),
    product: (0, pg_core_1.text)('product'),
    observedAt: (0, pg_core_1.timestamp)('observed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    runIpPortUnique: (0, pg_core_1.uniqueIndex)('uq_port_findings_run_ip_port').on(table.runId, table.ip, table.port),
    ipIdx: (0, pg_core_1.index)('idx_port_findings_ip').on(table.ip),
    portIdx: (0, pg_core_1.index)('idx_port_findings_port').on(table.port),
    observedIdx: (0, pg_core_1.index)('idx_port_findings_observed').on(table.observedAt),
}));
