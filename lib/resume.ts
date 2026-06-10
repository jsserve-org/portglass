import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { isNull, eq } from 'drizzle-orm';
import { launchScanner } from '@/lib/scanner';

/** True if a process with this pid is currently alive in our namespace. */
function isAlive(pid: number | null): boolean {
  if (!pid || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH => no such process; EPERM => exists but not ours (still alive).
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * On server startup, find scans that never recorded finished_at. A hard kill of
 * the scanner (container redeploy, crash, OOM) skips the normal finalize path,
 * leaving the run stuck "Active". For each such run whose scanner process is no
 * longer alive, replay the stored argv to resume it (fast_scan.py upserts
 * findings idempotently). Runs without stored args can't be resumed, so they're
 * marked finished to clear the false "Active".
 */
export async function resumeOrphanedScans(): Promise<void> {
  let orphans;
  try {
    orphans = await db.select().from(scanRuns).where(isNull(scanRuns.finishedAt));
  } catch (err) {
    console.error('resumeOrphanedScans: failed to query unfinished runs', err);
    return;
  }

  for (const run of orphans) {
    // A scanner that is genuinely still running (e.g. after a soft restart that
    // left the detached child alive) must not be duplicated.
    if (isAlive(run.scannerPid)) {
      console.log(`run_id=${run.id} scanner still alive (pid ${run.scannerPid}); leaving it`);
      continue;
    }

    let args: string[] | null = null;
    if (run.scanArgs) {
      try {
        const parsed = JSON.parse(run.scanArgs);
        if (Array.isArray(parsed) && parsed.length > 0) args = parsed as string[];
      } catch {
        // fall through to finalize
      }
    }

    if (!args) {
      await db
        .update(scanRuns)
        .set({ finishedAt: new Date(), scannerPid: null })
        .where(eq(scanRuns.id, run.id))
        .catch((e) => console.error(`Failed to finalize unresumable run_id=${run.id}`, e));
      console.log(`run_id=${run.id} has no stored args; marked finished`);
      continue;
    }

    console.log(`Resuming orphaned scan run_id=${run.id} (${run.cidr})`);
    launchScanner(run.id, args, { ...process.env } as NodeJS.ProcessEnv);
  }
}
