import { db } from '@/lib/db';
import { scanRuns, portFindings } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { desc, eq, count, inArray, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { cached } from '@/lib/cache';
import { junkMatchSql, sqlArray } from '@/lib/junk';
import { deviceTypeCaseSql } from '@/lib/classify-sql';

function ipCountFromCidr(cidr: string): number {
  try {
    const [ipPart, prefix] = cidr.split('/');
    const p = parseInt(prefix, 10);
    if (isNaN(p) || p < 0 || p > 32) return 0;
    const parts = ipPart.split('.').map((n) => parseInt(n, 10));
    if (parts.length !== 4 || parts.some((n) => isNaN(n))) return 0;
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

  // Cache the raw DB reads briefly. The scans list / WebSocket poll this every
  // ~2s per client; a 1.5s TTL keeps it feeling live while collapsing bursts of
  // identical reads (across clients) into a single query.
  const { runs, countMap, deviceMap } = await cached('runs:list', 1500, async () => {
    const runs = await db.select().from(scanRuns).orderBy(desc(scanRuns.startedAt)).limit(100);
    const countMap: Record<number, number> = {};
    const deviceMap: Record<number, { device_type: string; count: number }[]> = {};
    if (runs.length) {
      const runIds = runs.map((r) => r.id);
      const counts = await db
        .select({ runId: portFindings.runId, cnt: count() })
        .from(portFindings)
        .where(inArray(portFindings.runId, runIds))
        .groupBy(portFindings.runId);
      for (const row of counts) {
        if (row.runId != null) countMap[row.runId] = Number(row.cnt);
      }
      // Per-run device-type breakdown (one grouped pass over these runs' hosts).
      const devRows = await db.execute(sql`
        SELECT run_id AS "runId", device_type, COUNT(*)::int AS count
        FROM (
          SELECT run_id, ip, ${deviceTypeCaseSql()} AS device_type
          FROM port_findings
          WHERE run_id = ANY(${sqlArray(runIds)}::int[]) AND NOT ${junkMatchSql()}
          GROUP BY run_id, ip
        ) t
        WHERE device_type <> 'unknown'
        GROUP BY run_id, device_type
        ORDER BY count DESC
      `);
      for (const r of devRows.rows as any[]) {
        const id = Number(r.runId);
        (deviceMap[id] ??= []).push({ device_type: r.device_type, count: Number(r.count) });
      }
    }
    return { runs, countMap, deviceMap };
  });

  if (runs.length === 0) {
    return Response.json([]);
  }

  const now = Date.now();
  // A scan writes a heartbeat (progress_at) every few seconds while running. If
  // an unfinished run's heartbeat is older than this, its scanner is dead (crash
  // / OOM / hard restart) and we report it as stalled rather than "running".
  const STALE_MS = 60 * 1000;

  const enriched = runs.map((run) => {
    const findingsCount = countMap[run.id] ?? 0;
    const started = new Date(run.startedAt).getTime();
    const finished = run.finishedAt ? new Date(run.finishedAt).getTime() : null;
    const progressTs = run.progressAt ? new Date(run.progressAt).getTime() : null;
    // For an unfinished run, freeze elapsed at the last heartbeat if it's stale,
    // so a dead scan doesn't keep ticking up its "elapsed" forever.
    const liveEnd = finished ?? (progressTs && now - progressTs > STALE_MS ? progressTs : now);
    const elapsedSec = Math.max(0, Math.round((liveEnd - started) / 1000));

    // A queued run hasn't launched yet, so it isn't stale even without a beat.
    const stale = !run.finishedAt && !run.queued && (!progressTs || now - progressTs > STALE_MS);

    let status: 'active' | 'completed' | 'killed' | 'failed' | 'stalled' | 'queued' = 'active';
    if (run.finishedAt) {
      status = run.notes?.includes('Force killed') ? 'killed'
        : run.notes?.includes('Interrupted') ? 'failed'
        : 'completed';
    } else if (run.queued) {
      status = 'queued';
    } else if (stale) {
      status = 'stalled';
    }

    // Prefer the scanner's real target count + attempts when available; fall
    // back to a CIDR×ports estimate for older runs without progress data.
    const totalHosts = ipCountFromCidr(run.cidr);
    const portsCount = run.ports.split(',').length;
    const totalTargets = run.totalTargets ?? totalHosts * portsCount;
    const attempted = run.attemptedTargets ?? 0;
    const estimatedTotalSec = totalTargets > 0 ? Math.round(totalTargets / 250) : 0;

    let progressPct: number;
    if (run.finishedAt) {
      progressPct = 100;
    } else if (run.totalTargets && run.totalTargets > 0) {
      progressPct = Math.min(99, Math.round((attempted / run.totalTargets) * 100));
    } else {
      progressPct = totalTargets > 0
        ? Math.min(99, Math.round((elapsedSec / Math.max(elapsedSec, estimatedTotalSec)) * 100))
        : 0;
    }

    const etaSec = !run.finishedAt && !stale && !run.queued && estimatedTotalSec > 0
      ? Math.max(0, estimatedTotalSec - elapsedSec)
      : 0;

    return {
      ...run,
      findingsCount,
      deviceCounts: deviceMap[run.id] ?? [],
      // A queued run hasn't started; don't tick elapsed or show progress.
      elapsedSec: run.queued ? 0 : elapsedSec,
      etaSec,
      estimatedTotalSec,
      status,
      stale,
      queued: run.queued,
      totalTargets,
      attemptedTargets: attempted,
      currentIp: run.currentIp ?? null,
      progressPct: run.queued ? 0 : progressPct,
    };
  });

  return Response.json(enriched);
}
