import { db } from '@/lib/db';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';
import { cached } from '@/lib/cache';
import { junkMatchSql } from '@/lib/junk';

// GET /api/asns — the top networks (by distinct-host count) in the dataset, for
// the search sidebar's "Filter by ASN". Resolves each distinct (non-junk) host
// to its most-specific ASN block, then groups.
export async function GET() {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await cached('asns', 60_000, async () => {
    const res = await db.execute(sql`
      SELECT asn, MAX(org) AS org, COUNT(*)::int AS count
      FROM (
        SELECT
          (SELECT a.asn FROM asn_blocks a WHERE a.network >>= d.ip::inet ORDER BY masklen(a.network) DESC LIMIT 1) AS asn,
          (SELECT a.org FROM asn_blocks a WHERE a.network >>= d.ip::inet ORDER BY masklen(a.network) DESC LIMIT 1) AS org
        FROM (SELECT DISTINCT ip FROM port_findings WHERE NOT ${junkMatchSql()}) d
      ) t
      WHERE asn IS NOT NULL
      GROUP BY asn
      ORDER BY count DESC
      LIMIT 25
    `);
    return { asns: res.rows as { asn: number; org: string | null; count: number }[] };
  });

  return Response.json(payload);
}
