import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { portFindings } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';

export async function GET() {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const rows = await db.execute(sql`
    SELECT
      ip,
      COUNT(DISTINCT port) as port_count,
      MAX(observed_at) as last_seen,
      jsonb_agg(DISTINCT jsonb_build_object('port', port, 'banner', banner, 'headers', headers, 'service', service)) FILTER (WHERE port IS NOT NULL) as ports
    FROM port_findings
    GROUP BY ip
    ORDER BY last_seen DESC
    LIMIT 500
  `);

  return NextResponse.json(rows.rows);
}
