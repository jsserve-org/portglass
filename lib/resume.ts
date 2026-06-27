import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { isNull, eq, sql } from 'drizzle-orm';
import { dispatchQueued } from '@/lib/queue';

// Only resume scans that were genuinely alive when the container went down,
// i.e. heartbeated within this window. Anything older was already dead/stalled
// before the restart, so we finalize it instead of reviving a zombie (which is
// what used to pile up into a stampede).
const RESUMABLE_HEARTBEAT_MS = 10 * 60 * 1000;

async function finalizeInterrupted(id: number): Promise<void> {
  await db
    .update(scanRuns)
    .set({
      finishedAt: new Date(),
      scannerPid: null,
      currentIp: null,
      notes: sql`concat(coalesce(${scanRuns.notes}, ''), ' [Interrupted by restart]')`,
    })
    .where(eq(scanRuns.id, id))
    .catch((e) => console.error(`Failed to finalize run_id=${id}`, e));
}

/**
 * On startup, reconcile scans with no finished_at (orphaned by the previous
 * container instance — in this single-container setup a restart kills the whole
 * tree, so none are actually running now).
 *
 * Scans that were actively heartbeating when killed are put back in the QUEUE
 * (queued=true) and the dispatcher starts up to MAX_CONCURRENT_SCANS of them,
 * continuing from where they left off (lib/queue applies --resume-offset). This
 * way a restart never spawns a stampede — extra scans simply wait their turn.
 * Scans that were already stale, or have no replayable argv, are finalized as
 * interrupted.
 */
export async function resumeOrphanedScans(): Promise<void> {
  let orphans;
  try {
    orphans = await db.select().from(scanRuns).where(isNull(scanRuns.finishedAt));
  } catch (err) {
    console.error('resumeOrphanedScans: failed to query unfinished runs', err);
    return;
  }

  const now = Date.now();
  let queuedForResume = 0;

  for (const run of orphans) {
    let hasArgs = false;
    if (run.scanArgs) {
      try {
        const parsed = JSON.parse(run.scanArgs);
        hasArgs = Array.isArray(parsed) && parsed.length > 0;
      } catch {
        /* not replayable */
      }
    }

    const beat = run.progressAt ? new Date(run.progressAt).getTime() : 0;
    const wasAlive = beat > 0 && now - beat < RESUMABLE_HEARTBEAT_MS;

    if (!hasArgs || !wasAlive) {
      await finalizeInterrupted(run.id);
      console.log(`run_id=${run.id} finalized (${!hasArgs ? 'no args' : 'stale heartbeat'})`);
      continue;
    }

    // Park it in the queue; the dispatcher will start it (with a resume offset)
    // when a slot is free.
    await db.update(scanRuns).set({ queued: true, scannerPid: null }).where(eq(scanRuns.id, run.id));
    queuedForResume++;
  }

  if (queuedForResume > 0) {
    console.log(`Queued ${queuedForResume} scan(s) to resume; starting up to the concurrency limit`);
    await dispatchQueued();
  }
}
