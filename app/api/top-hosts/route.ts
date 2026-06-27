import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';
import { cached } from '@/lib/cache';

export async function GET() {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const result = await cached('top-hosts', 30_000, async () => {
  // Best hosts = lowest average latency with the most open ports.
  // Limit to 10 top performers.
  const rows = await db.execute(sql`
    SELECT
      ip,
      COUNT(DISTINCT port)::int as open_ports,
      ROUND(AVG(latency_ms)::numeric, 1) as avg_latency_ms,
      MIN(latency_ms) as best_latency_ms,
      MAX(observed_at) as last_seen,
      array_agg(DISTINCT port ORDER BY port) as ports
    FROM port_findings
    WHERE state = 'open'
    GROUP BY ip
    HAVING COUNT(DISTINCT port) > 0
    ORDER BY AVG(latency_ms) ASC, COUNT(DISTINCT port) DESC
    LIMIT 20
  `);

  return (rows.rows as any[]).map((r) => ({
    ip: String(r.ip),
    openPorts: Number(r.open_ports),
    avgLatencyMs: Number(r.avg_latency_ms),
    bestLatencyMs: Number(r.best_latency_ms),
    lastSeen: String(r.last_seen),
    ports: (r.ports as number[]) ?? [],
  }));
  });

  return NextResponse.json(result);
}
