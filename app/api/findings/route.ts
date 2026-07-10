import { db } from '@/lib/db';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { cached } from '@/lib/cache';
import { junkMatchSql } from '@/lib/junk';
import { classifyDevice } from '@/lib/classify';

const querySchema = z.object({
  q: z.string().optional().default(''),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(request: Request) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = querySchema.parse(Object.fromEntries(searchParams));
  const offset = (query.page - 1) * query.pageSize;
  const port = query.port ?? null;
  const needle = query.q ? `%${query.q}%` : null;
  // Junk (Fortinet noise, junk ports) is purged from the DB and blocked at scan
  // time; this is a belt-and-suspenders filter so any stragglers never surface.
  const notJunk = sql`NOT ${junkMatchSql()}`;

  // The search view intentionally returns one card per IP address. If a host
  // has multiple matching open ports, keep the most recently observed finding
  // as the representative row; the host detail page shows the full port list.
  // Page the distinct-IP rows first, then enrich only that page with geo/ASN.
  // Previously the geo subqueries ran for every distinct IP in the table on
  // each request (and on every poll), which got expensive as data grew.
  const rowsQuery = sql`
    SELECT
      page.*,
      (SELECT g.country_iso FROM geo_blocks g WHERE g.network >>= page.ip::inet ORDER BY masklen(g.network) DESC LIMIT 1) AS "countryIso",
      (SELECT g.country_name FROM geo_blocks g WHERE g.network >>= page.ip::inet ORDER BY masklen(g.network) DESC LIMIT 1) AS "countryName",
      (SELECT a.asn FROM asn_blocks a WHERE a.network >>= page.ip::inet ORDER BY masklen(a.network) DESC LIMIT 1) AS "asn",
      (SELECT a.org FROM asn_blocks a WHERE a.network >>= page.ip::inet ORDER BY masklen(a.network) DESC LIMIT 1) AS "org"
    FROM (
      SELECT * FROM (
        SELECT DISTINCT ON (ip)
          id,
          run_id AS "runId",
          ip,
          port,
          state,
          latency_ms AS "latencyMs",
          banner,
          headers,
          service,
          product,
          observed_at AS "observedAt"
        FROM port_findings
        WHERE (${port}::int IS NULL OR port = ${port})
          AND ${notJunk}
          AND (
            ${needle}::text IS NULL
            OR ip ILIKE ${needle}
            OR COALESCE(banner, '') ILIKE ${needle}
            OR COALESCE(headers, '') ILIKE ${needle}
            OR COALESCE(service, '') ILIKE ${needle}
            OR COALESCE(product, '') ILIKE ${needle}
          )
        ORDER BY ip, observed_at DESC
      ) one_per_ip
      ORDER BY "observedAt" DESC
      LIMIT ${query.pageSize}
      OFFSET ${offset}
    ) page
    ORDER BY page."observedAt" DESC
  `;

  const countQuery = sql`
    SELECT COUNT(DISTINCT ip)::int AS value
    FROM port_findings
    WHERE (${port}::int IS NULL OR port = ${port})
      AND ${notJunk}
      AND (
        ${needle}::text IS NULL
        OR ip ILIKE ${needle}
        OR COALESCE(banner, '') ILIKE ${needle}
        OR COALESCE(headers, '') ILIKE ${needle}
        OR COALESCE(service, '') ILIKE ${needle}
        OR COALESCE(product, '') ILIKE ${needle}
      )
  `;

  // The search view auto-refreshes; identical queries (same filter + page) are
  // common across refreshes/clients. Cache the heavy geo-enriched result 10s.
  const cacheKey = `findings:${port ?? ''}:${query.q}:${query.page}:${query.pageSize}`;
  const payload = await cached(cacheKey, 10_000, async () => {
    const [rowsResult, totalRows] = await Promise.all([
      db.execute(rowsQuery),
      db.execute(countQuery),
    ]);

    // The card shows one representative row per IP, but device classification
    // needs the host's FULL port/banner set. Pull all (non-junk) findings for
    // just this page's IPs (≤ pageSize hosts) and classify each in JS.
    const rows = rowsResult.rows as any[];
    const ips = [...new Set(rows.map((r) => String(r.ip)))];
    const deviceByIp = new Map<string, ReturnType<typeof classifyDevice>>();
    if (ips.length) {
      const agg = await db.execute(sql`
        SELECT ip::text AS ip, port,
               service, product,
               LEFT(COALESCE(banner, ''), 512) AS banner,
               LEFT(COALESCE(headers, ''), 2048) AS headers
        FROM port_findings
        WHERE ip::text = ANY(${ips}) AND ${notJunk}
      `);
      const byIp = new Map<string, any[]>();
      for (const f of agg.rows as any[]) {
        const list = byIp.get(f.ip) ?? [];
        list.push(f);
        byIp.set(f.ip, list);
      }
      for (const [ip, list] of byIp) deviceByIp.set(ip, classifyDevice(list));
    }

    return {
      rows: rows.map((r) => {
        const d = deviceByIp.get(String(r.ip));
        return {
          ...r,
          device: d && d.type !== 'unknown'
            ? { type: d.type, label: d.label, confidence: d.confidence }
            : null,
        };
      }),
      total: Number((totalRows.rows[0] as any)?.value ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  });

  return Response.json(payload);
}
