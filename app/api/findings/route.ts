import { db } from '@/lib/db';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { cached } from '@/lib/cache';
import { fortinetMatchSql } from '@/lib/fortinet';

const querySchema = z.object({
  q: z.string().optional().default(''),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  // Hide Fortinet appliances by default; pass hideFortinet=0 to include them.
  hideFortinet: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .default('1')
    .transform((v) => v === '1' || v === 'true'),
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
  // When hiding Fortinet gear, exclude any row that fingerprints as Fortinet;
  // otherwise this fragment is a no-op (TRUE) so all rows pass.
  const fortinetFilter = query.hideFortinet ? sql`NOT ${fortinetMatchSql()}` : sql`TRUE`;

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
          AND ${fortinetFilter}
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
      AND ${fortinetFilter}
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
  const cacheKey = `findings:${port ?? ''}:${query.q}:${query.page}:${query.pageSize}:f${query.hideFortinet ? 1 : 0}`;
  const payload = await cached(cacheKey, 10_000, async () => {
    const [rowsResult, totalRows] = await Promise.all([
      db.execute(rowsQuery),
      db.execute(countQuery),
    ]);
    return {
      rows: rowsResult.rows,
      total: Number((totalRows.rows[0] as any)?.value ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  });

  return Response.json(payload);
}
