import { db } from '@/lib/db';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';
import { cached } from '@/lib/cache';
import { junkMatchSql } from '@/lib/junk';
import { deviceTypeCaseSql } from '@/lib/classify-sql';

// GET /api/device-types — count of distinct hosts per auto-detected device type
// (junk excluded), for the search sidebar filter. Unknown hosts are omitted.
export async function GET() {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await cached('device-types', 30_000, async () => {
    const res = await db.execute(sql`
      SELECT device_type, COUNT(*)::int AS count
      FROM (
        SELECT ip, ${deviceTypeCaseSql()} AS device_type
        FROM port_findings
        WHERE NOT ${junkMatchSql()}
        GROUP BY ip
      ) t
      WHERE device_type <> 'unknown'
      GROUP BY device_type
      ORDER BY count DESC
    `);
    return { types: res.rows as { device_type: string; count: number }[] };
  });

  return Response.json(payload);
}
