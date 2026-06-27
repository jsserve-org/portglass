import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { isNull, sql } from 'drizzle-orm';

/**
 * On server startup, reconcile scans that never recorded finished_at.
 *
 * In this single-container Docker deployment, a restart/reboot kills the whole
 * process tree (tini is pid 1), so ANY scan still marked unfinished was orphaned
 * by the previous container instance — none can actually be running now. The
 * old code tried to detect "still alive" scanners by pid and to auto-resume the
 * rest, but:
 *   - pids are meaningless across a restart (the namespace resets; node is
 *     always pid 7), so the check produced false "still alive" matches via pid
 *     reuse and left runs stuck "Active" forever; and
 *   - blindly relaunching every unfinished scan at boot spawned a stampede of
 *     fast_scan.py processes that overwhelmed the small host.
 *
 * So we simply finalize every orphan as interrupted. Findings already collected
 * are preserved (they're committed as the scan runs); the user can re-scan a
 * range from the UI if they want it continued. This makes startup cheap and
 * keeps run status honest.
 */
export async function resumeOrphanedScans(): Promise<void> {
  try {
    const result = await db
      .update(scanRuns)
      .set({
        finishedAt: new Date(),
        scannerPid: null,
        currentIp: null,
        notes: sql`concat(coalesce(${scanRuns.notes}, ''), ' [Interrupted by restart]')`,
      })
      .where(isNull(scanRuns.finishedAt))
      .returning({ id: scanRuns.id });

    if (result.length) {
      console.log(`Finalized ${result.length} interrupted scan(s): ${result.map((r) => r.id).join(', ')}`);
    }
  } catch (err) {
    console.error('resumeOrphanedScans: failed to reconcile unfinished runs', err);
  }
}
