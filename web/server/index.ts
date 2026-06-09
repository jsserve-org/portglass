import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { auth, requiresAuth } from 'express-openid-connect';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { portFindings, scanRuns } from './schema';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://scanner:scanner@localhost:5432/scanner';
const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

const app = express();
const publicPort = Number(process.env.PUBLIC_PORT ?? process.env.PORT ?? 51111);
const baseURL = process.env.BASE_URL ?? `http://localhost:${publicPort}`;

if (process.env.AUTHENTIK_ISSUER_BASE_URL && process.env.AUTHENTIK_CLIENT_ID && process.env.AUTHENTIK_CLIENT_SECRET && process.env.SESSION_SECRET) {
  app.use(auth({
    authRequired: false,
    auth0Logout: true,
    issuerBaseURL: process.env.AUTHENTIK_ISSUER_BASE_URL,
    baseURL,
    clientID: process.env.AUTHENTIK_CLIENT_ID,
    clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
    secret: process.env.SESSION_SECRET,
    routes: { callback: '/callback', login: '/login', logout: '/logout' },
  }));
  app.use('/api', requiresAuth());
  console.log(`Authentik OIDC enabled for ${baseURL}`);
} else {
  console.warn('Authentik OIDC disabled: set AUTHENTIK_ISSUER_BASE_URL, AUTHENTIK_CLIENT_ID, AUTHENTIK_CLIENT_SECRET, SESSION_SECRET');
}

app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  await pool.query('select 1');
  res.json({ ok: true });
});

app.get('/api/stats', async (_req, res) => {
  const [totalRows, hostRows, portRows, runRows] = await Promise.all([
    db.select({ value: count() }).from(portFindings),
    db.execute(sql`select count(distinct ip) as value from port_findings`),
    db.execute(sql`select count(distinct port) as value from port_findings`),
    db.select({ value: count() }).from(scanRuns),
  ]);
  const topPorts = await db.execute(sql`
    select port, count(*)::int as count
    from port_findings
    group by port
    order by count desc
    limit 12
  `);
  res.json({
    findings: Number(totalRows[0]?.value ?? 0),
    hosts: Number((hostRows.rows[0] as any)?.value ?? 0),
    ports: Number((portRows.rows[0] as any)?.value ?? 0),
    runs: Number(runRows[0]?.value ?? 0),
    topPorts: topPorts.rows,
  });
});

const querySchema = z.object({
  q: z.string().optional().default(''),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

app.get('/api/findings', async (req, res) => {
  const query = querySchema.parse(req.query);
  const filters = [];
  if (query.port) filters.push(eq(portFindings.port, query.port));
  if (query.q) {
    const needle = `%${query.q}%`;
    filters.push(or(
      ilike(portFindings.ip, needle),
      ilike(portFindings.banner, needle),
      ilike(portFindings.service, needle),
      ilike(portFindings.product, needle),
    ));
  }
  const where = filters.length ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;
  const [rows, totalRows] = await Promise.all([
    db.select().from(portFindings).where(where).orderBy(desc(portFindings.observedAt)).limit(query.pageSize).offset(offset),
    db.select({ value: count() }).from(portFindings).where(where),
  ]);
  res.json({ rows, total: Number(totalRows[0]?.value ?? 0), page: query.page, pageSize: query.pageSize });
});

app.get('/api/me', (req, res) => {
  res.json({ user: (req as any).oidc?.user ?? null });
});

app.get('/api/runs', async (_req, res) => {
  const rows = await db.select().from(scanRuns).orderBy(desc(scanRuns.startedAt)).limit(50);
  res.json(rows);
});

const distDir = path.resolve(process.cwd(), 'dist');
app.use(express.static(distDir));
app.get('*', requiresAuth(), (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number(process.env.PORT ?? 51111);
app.listen(port, () => {
  console.log(`Portglass listening on http://localhost:${port}`);
});
