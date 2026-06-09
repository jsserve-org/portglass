"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const node_path_1 = __importDefault(require("node:path"));
const express_openid_connect_1 = require("express-openid-connect");
const node_postgres_1 = require("drizzle-orm/node-postgres");
const pg_1 = require("pg");
const drizzle_orm_1 = require("drizzle-orm");
const zod_1 = require("zod");
const schema_1 = require("./schema");
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://scanner:scanner@localhost:5432/scanner';
const pool = new pg_1.Pool({ connectionString: DATABASE_URL });
const db = (0, node_postgres_1.drizzle)(pool);
const app = (0, express_1.default)();
const publicPort = Number(process.env.PUBLIC_PORT ?? process.env.PORT ?? 51111);
const baseURL = process.env.BASE_URL ?? `http://localhost:${publicPort}`;
if (process.env.AUTHENTIK_ISSUER_BASE_URL && process.env.AUTHENTIK_CLIENT_ID && process.env.AUTHENTIK_CLIENT_SECRET && process.env.SESSION_SECRET) {
    app.use((0, express_openid_connect_1.auth)({
        authRequired: false,
        auth0Logout: true,
        issuerBaseURL: process.env.AUTHENTIK_ISSUER_BASE_URL,
        baseURL,
        clientID: process.env.AUTHENTIK_CLIENT_ID,
        clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
        secret: process.env.SESSION_SECRET,
        routes: { callback: '/callback', login: '/login', logout: '/logout' },
    }));
    app.use('/api', (0, express_openid_connect_1.requiresAuth)());
    console.log(`Authentik OIDC enabled for ${baseURL}`);
}
else {
    console.warn('Authentik OIDC disabled: set AUTHENTIK_ISSUER_BASE_URL, AUTHENTIK_CLIENT_ID, AUTHENTIK_CLIENT_SECRET, SESSION_SECRET');
}
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get('/api/health', async (_req, res) => {
    await pool.query('select 1');
    res.json({ ok: true });
});
app.get('/api/stats', async (_req, res) => {
    const [totalRows, hostRows, portRows, runRows] = await Promise.all([
        db.select({ value: (0, drizzle_orm_1.count)() }).from(schema_1.portFindings),
        db.execute((0, drizzle_orm_1.sql) `select count(distinct ip) as value from port_findings`),
        db.execute((0, drizzle_orm_1.sql) `select count(distinct port) as value from port_findings`),
        db.select({ value: (0, drizzle_orm_1.count)() }).from(schema_1.scanRuns),
    ]);
    const topPorts = await db.execute((0, drizzle_orm_1.sql) `
    select port, count(*)::int as count
    from port_findings
    group by port
    order by count desc
    limit 12
  `);
    res.json({
        findings: Number(totalRows[0]?.value ?? 0),
        hosts: Number(hostRows.rows[0]?.value ?? 0),
        ports: Number(portRows.rows[0]?.value ?? 0),
        runs: Number(runRows[0]?.value ?? 0),
        topPorts: topPorts.rows,
    });
});
const querySchema = zod_1.z.object({
    q: zod_1.z.string().optional().default(''),
    port: zod_1.z.coerce.number().int().min(1).max(65535).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(200).default(50),
});
app.get('/api/findings', async (req, res) => {
    const query = querySchema.parse(req.query);
    const filters = [];
    if (query.port)
        filters.push((0, drizzle_orm_1.eq)(schema_1.portFindings.port, query.port));
    if (query.q) {
        const needle = `%${query.q}%`;
        filters.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.portFindings.ip, needle), (0, drizzle_orm_1.ilike)(schema_1.portFindings.banner, needle), (0, drizzle_orm_1.ilike)(schema_1.portFindings.service, needle), (0, drizzle_orm_1.ilike)(schema_1.portFindings.product, needle)));
    }
    const where = filters.length ? (0, drizzle_orm_1.and)(...filters) : undefined;
    const offset = (query.page - 1) * query.pageSize;
    const [rows, totalRows] = await Promise.all([
        db.select().from(schema_1.portFindings).where(where).orderBy((0, drizzle_orm_1.desc)(schema_1.portFindings.observedAt)).limit(query.pageSize).offset(offset),
        db.select({ value: (0, drizzle_orm_1.count)() }).from(schema_1.portFindings).where(where),
    ]);
    res.json({ rows, total: Number(totalRows[0]?.value ?? 0), page: query.page, pageSize: query.pageSize });
});
app.get('/api/me', (req, res) => {
    res.json({ user: req.oidc?.user ?? null });
});
app.get('/api/runs', async (_req, res) => {
    const rows = await db.select().from(schema_1.scanRuns).orderBy((0, drizzle_orm_1.desc)(schema_1.scanRuns.startedAt)).limit(50);
    res.json(rows);
});
const distDir = node_path_1.default.resolve(process.cwd(), 'dist');
app.use(express_1.default.static(distDir));
app.get('*', (0, express_openid_connect_1.requiresAuth)(), (_req, res) => {
    res.sendFile(node_path_1.default.join(distDir, 'index.html'));
});
const port = Number(process.env.PORT ?? 51111);
app.listen(port, () => {
    console.log(`Portglass listening on http://localhost:${port}`);
});
