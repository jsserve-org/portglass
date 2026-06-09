import { db } from '@/lib/db';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

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

  // The search view intentionally returns one card per IP address. If a host
  // has multiple matching open ports, keep the most recently observed finding
  // as the representative row; the host detail page shows the full port list.
  const rowsQuery = sql`
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
  `;

  const countQuery = sql`
    SELECT COUNT(DISTINCT ip)::int AS value
    FROM port_findings
    WHERE (${port}::int IS NULL OR port = ${port})
      AND (
        ${needle}::text IS NULL
        OR ip ILIKE ${needle}
        OR COALESCE(banner, '') ILIKE ${needle}
        OR COALESCE(headers, '') ILIKE ${needle}
        OR COALESCE(service, '') ILIKE ${needle}
        OR COALESCE(product, '') ILIKE ${needle}
      )
  `;

  const [rowsResult, totalRows] = await Promise.all([
    db.execute(rowsQuery),
    db.execute(countQuery),
  ]);

  return Response.json({
    rows: rowsResult.rows,
    total: Number((totalRows.rows[0] as any)?.value ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  });
}
