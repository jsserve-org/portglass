import { db } from '@/lib/db';
import { scanRuns, portFindings } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { desc, eq, sql as drizzleSql, count } from 'drizzle-orm';
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';

function ipCountFromCidr(cidr: string): number {
  try {
    const [ipPart, prefix] = cidr.split('/');
    const p = parseInt(prefix, 10);
    if (isNaN(p) || p < 0 || p > 32) return 0;
    const parts = ipPart.split('.').map((n) => parseInt(n, 10));
    if (parts.length !== 4 || parts.some((n) => isNaN(n))) return 0;
    // Approximate host count
    if (p >= 31) return 1;
    return Math.max(1, Math.pow(2, 32 - p) - 2);
  } catch {
    return 0;
  }
}

export async function GET() {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runs = await db.select().from(scanRuns).orderBy(desc(scanRuns.startedAt)).limit(100);

  if (runs.length === 0) {
    return Response.json([]);
  }

  const runIds = runs.map((r) => r.id);

  const findingsCounts = await db.execute(sql`
    SELECT run_id, COUNT(*)::int as cnt
    FROM port_findings
    WHERE run_id = ANY(${runIds})
    GROUP BY run_id
  `);

  const countMap: Record<number, number> = {};
  for (const row of findingsCounts.rows as any[]) {
    countMap[Number(row.run_id)] = Number(row.cnt);
  }

  const now = Date.now();

  const enriched = runs.map((run) => {
    const findingsCount = countMap[run.id] ?? 0;
    const started = new Date(run.startedAt).getTime();
    const finished = run.finishedAt ? new Date(run.finishedAt).getTime() : null;
    const elapsedSec = finished ? Math.round((finished - started) / 1000) : Math.round((now - started) / 1000);

    let status: 'active' | 'completed' | 'killed' | 'failed' = 'active';
    if (run.finishedAt) {
      status = run.notes?.includes('Force killed') ? 'killed' : 'completed';
    }

    // Rough progress estimate: we don't know total scanned attempts, but we
    // can give a lower-bound based on findings vs CIDR size.
    const totalHosts = ipCountFromCidr(run.cidr);
    const portsCount = run.ports.split(',').length;
    const totalTargets = totalHosts * portsCount;
    // Heuristic: if we have findings, we're making progress. This is very
    // approximate since most targets will be closed/filtered.
    const progressPct = totalTargets > 0 && !run.finishedAt
      ? Math.min(99, Math.round((elapsedSec / Math.max(elapsedSec, totalTargets / 250)) * 100))
      : run.finishedAt ? 100 : 0;

    return {
      ...run,
      findingsCount,
      elapsedSec,
      status,
      progressPct: run.finishedAt ? 100 : progressPct,
    };
  });

  return Response.json(enriched);
}
