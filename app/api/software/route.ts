import { db } from '@/lib/db';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';
import { cached } from '@/lib/cache';
import { junkMatchSql, sqlArray } from '@/lib/junk';
import { SOFTWARE, SOFTWARE_HAY } from '@/lib/software';

// GET /api/software — distinct-host counts per software/vendor fingerprint, for
// the search sidebar "Software" facet. One pass with a FILTERed count per
// vendor; only non-zero vendors are returned, strongest first.
export async function GET() {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await cached('software', 60_000, async () => {
    const cols = sql.join(
      SOFTWARE.map(
        (s) => sql`COUNT(DISTINCT ip) FILTER (WHERE ${SOFTWARE_HAY} ILIKE ANY(${sqlArray(s.like)}))::int AS ${sql.identifier(s.key)}`,
      ),
      sql`, `,
    );
    const res = await db.execute(sql`
      SELECT ${cols}
      FROM port_findings
      WHERE NOT ${junkMatchSql()}
    `);
    const row = (res.rows[0] as Record<string, number>) ?? {};
    const items = SOFTWARE.map((s) => ({ key: s.key, label: s.label, count: Number(row[s.key] ?? 0) }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count);
    return { software: items };
  });

  return Response.json(payload, {
    headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
  });
}
