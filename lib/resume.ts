import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { isNull, eq, sql } from 'drizzle-orm';
import { launchScanner } from '@/lib/scanner';

// Only resume scans that were genuinely alive when the container went down,
// i.e. heartbeated within this window. Anything older was already dead/stalled
// before the restart, so we finalize it instead of reviving a zombie (which is
// what used to pile up into a stampede).
const RESUMABLE_HEARTBEAT_MS = 10 * 60 * 1000;
// Redo a little overlap before the last recorded progress, since targets that
// were in flight when the scanner died may not have completed.
const RESUME_MARGIN = 2000;
// Stagger resumes so we don't spawn every scanner in the same instant.
const RESUME_STAGGER_MS = 1500;

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
 * Scans that were actively heartbeating when killed are RESUMED and continue
 * from roughly where they left off (via --resume-offset), so a redeploy doesn't
 * interrupt or restart them. The resume is serialized/staggered so we never
 * spawn a stampede. Scans that were already stale, or have no replayable argv,
 * are finalized as interrupted.
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
  const toResume: { id: number; args: string[] }[] = [];

  for (const run of orphans) {
    let args: string[] | null = null;
    if (run.scanArgs) {
      try {
        const parsed = JSON.parse(run.scanArgs);
        if (Array.isArray(parsed) && parsed.length > 0) args = parsed as string[];
      } catch {
        /* not replayable */
      }
    }

    const beat = run.progressAt ? new Date(run.progressAt).getTime() : 0;
    const wasAlive = beat > 0 && now - beat < RESUMABLE_HEARTBEAT_MS;

    if (!args || !wasAlive) {
      await finalizeInterrupted(run.id);
      console.log(`run_id=${run.id} finalized (${!args ? 'no args' : 'stale heartbeat'})`);
      continue;
    }

    // Continue from where it left off when the order is reproducible.
    const stealthOrDiscover = args.includes('--stealth') || args.includes('--discover');
    const offset = stealthOrDiscover ? 0 : Math.max(0, (run.attemptedTargets ?? 0) - RESUME_MARGIN);
    const resumeArgs = offset > 0 ? [...args, '--resume-offset', String(offset)] : args;
    toResume.push({ id: run.id, args: resumeArgs });
  }

  // Launch serially with a stagger so a redeploy doesn't spike CPU/RAM.
  for (let i = 0; i < toResume.length; i++) {
    const { id, args } = toResume[i];
    console.log(`Resuming scan run_id=${id} (continue)`);
    launchScanner(id, args, { ...process.env } as NodeJS.ProcessEnv);
    if (i < toResume.length - 1) {
      await new Promise((r) => setTimeout(r, RESUME_STAGGER_MS));
    }
  }
}
