import { db } from '@/lib/db';
import { portFindings, scanRuns } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { count, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { cached } from '@/lib/cache';

export async function GET() {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Whole-table aggregates that barely change second-to-second; cache 30s.
  const payload = await cached('stats', 30_000, async () => {
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
    return {
      findings: Number(totalRows[0]?.value ?? 0),
      hosts: Number((hostRows.rows[0] as any)?.value ?? 0),
      ports: Number((portRows.rows[0] as any)?.value ?? 0),
      runs: Number(runRows[0]?.value ?? 0),
      topPorts: topPorts.rows,
    };
  });

  return Response.json(payload, {
    // Match the 30s server cache so poll ticks between rebuilds are free.
    headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=30' },
  });
}
