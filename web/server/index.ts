import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { portFindings, scanRuns } from './schema';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://scanner:scanner@localhost:5432/scanner';
const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

const publicPort = Number(process.env.PUBLIC_PORT ?? process.env.PORT ?? 51111);
const baseURL = process.env.BASE_URL ?? `http://localhost:${publicPort}`;

const authentikConfigured =
  !!process.env.AUTHENTIK_ISSUER_BASE_URL &&
  !!process.env.AUTHENTIK_CLIENT_ID &&
  !!process.env.AUTHENTIK_CLIENT_SECRET;

const authPlugins = [];
if (authentikConfigured) {
  authPlugins.push(
    genericOAuth({
      config: [
        {
          providerId: 'authentik',
          clientId: process.env.AUTHENTIK_CLIENT_ID!,
          clientSecret: process.env.AUTHENTIK_CLIENT_SECRET!,
          discoveryUrl: `${process.env.AUTHENTIK_ISSUER_BASE_URL}/.well-known/openid-configuration`,
          scopes: ['openid', 'profile', 'email'],
        },
      ],
    }),
  );
}

const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  baseURL,
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  trustedOrigins: [baseURL],
  plugins: authPlugins,
});

const app = express();
app.use(cors());

// Better-auth handler must be mounted BEFORE express.json()
app.all('/api/auth/*', toNodeHandler(auth));

app.use(express.json());

// Public health endpoint
app.get('/api/health', async (_req, res) => {
  await pool.query('select 1');
  res.json({ ok: true });
});

// Auth middleware for protected routes
const authGuard: express.RequestHandler = async (req, res, next) => {
  if (!authentikConfigured) return next();
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

// Protected API routes
app.use('/api', authGuard);

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
    filters.push(
      or(
        ilike(portFindings.ip, needle),
        ilike(portFindings.banner, needle),
        ilike(portFindings.service, needle),
        ilike(portFindings.product, needle),
      ),
    );
  }
  const where = filters.length ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;
  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(portFindings)
      .where(where)
      .orderBy(desc(portFindings.observedAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ value: count() }).from(portFindings).where(where),
  ]);
  res.json({
    rows,
    total: Number(totalRows[0]?.value ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  });
});

app.get('/api/me', async (req, res) => {
  if (!authentikConfigured) return res.json({ user: null });
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  res.json({ user: session?.user ?? null });
});

app.get('/api/runs', async (_req, res) => {
  const rows = await db.select().from(scanRuns).orderBy(desc(scanRuns.startedAt)).limit(50);
  res.json(rows);
});

const distDir = path.resolve(process.cwd(), 'dist');
app.use(express.static(distDir));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number(process.env.PORT ?? 51111);
app.listen(port, () => {
  console.log(`Portglass listening on http://localhost:${port}`);
  if (authentikConfigured) {
    console.log(`Authentik SSO enabled at ${process.env.AUTHENTIK_ISSUER_BASE_URL}`);
  } else {
    console.warn('Authentik SSO disabled: set AUTHENTIK_ISSUER_BASE_URL, AUTHENTIK_CLIENT_ID, AUTHENTIK_CLIENT_SECRET');
  }
});
