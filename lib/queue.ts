import { db } from '@/lib/db';
import { scanRuns, type ScanRun } from '@/lib/schema';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { launchScanner } from '@/lib/scanner';

// Global cap on how many scans run at once. The rest wait in the queue and are
// started automatically as slots free. Configurable so a beefier host can run
// more; defaults low because this box is small and shared and heavy
// (65535-port) scans will saturate it otherwise.
export const MAX_CONCURRENT = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_SCANS || '2', 10) || 2,
);

// Redo a little overlap when resuming, since in-flight targets may not have
// completed before the scanner died.
const RESUME_MARGIN = 2000;

/** Scans currently occupying a slot: unfinished and not waiting in the queue. */
async function runningCount(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scanRuns)
    .where(and(isNull(scanRuns.finishedAt), eq(scanRuns.queued, false)));
  return Number(rows[0]?.n ?? 0);
}

/** Spawn the scanner for a run, applying a resume offset if it already ran. */
async function launchRun(run: ScanRun): Promise<void> {
  if (!run.scanArgs) return;
  let args: string[];
  try {
    args = JSON.parse(run.scanArgs);
    if (!Array.isArray(args) || !args.length) return;
  } catch {
    return;
  }

  const stealthOrDiscover = args.includes('--stealth') || args.includes('--discover') || args.includes('--dynamic');
  if (run.attemptedTargets != null && !stealthOrDiscover && !args.includes('--resume-offset')) {
    const offset = Math.max(0, run.attemptedTargets - RESUME_MARGIN);
    if (offset > 0) args = [...args, '--resume-offset', String(offset)];
  }

  // A never-started run starts its clock now (it may have waited in the queue);
  // a resumed run keeps its original started_at so elapsed stays honest.
  if (run.attemptedTargets == null) {
    await db.update(scanRuns).set({ startedAt: new Date() }).where(eq(scanRuns.id, run.id)).catch(() => {});
  }
  launchScanner(run.id, args, { ...process.env } as NodeJS.ProcessEnv);
}

/**
 * Decide whether a freshly-created run starts now or waits. Returns its state.
 */
export async function requestScan(runId: number): Promise<'started' | 'queued'> {
  // Mark pending first so this run doesn't count itself in the running tally
  // (new rows default queued=false, which would otherwise be an off-by-one).
  await db.update(scanRuns).set({ queued: true }).where(eq(scanRuns.id, runId));

  const running = await runningCount();
  if (running < MAX_CONCURRENT) {
    const run = (await db.select().from(scanRuns).where(eq(scanRuns.id, runId)).limit(1))[0];
    if (!run) return 'queued';
    await db.update(scanRuns).set({ queued: false }).where(eq(scanRuns.id, runId));
    await launchRun(run);
    return 'started';
  }
  return 'queued';
}

/** Start queued runs (oldest first) until the concurrency limit is reached. */
export async function dispatchQueued(): Promise<void> {
  let running = await runningCount();
  while (running < MAX_CONCURRENT) {
    const next = (
      await db
        .select()
        .from(scanRuns)
        .where(and(isNull(scanRuns.finishedAt), eq(scanRuns.queued, true)))
        .orderBy(asc(scanRuns.id))
        .limit(1)
    )[0];
    if (!next || !next.scanArgs) break;
    // Claim the slot before the async launch so we don't double-dispatch.
    await db.update(scanRuns).set({ queued: false }).where(eq(scanRuns.id, next.id));
    await launchRun(next);
    running++;
  }
}
