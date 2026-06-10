import { spawn } from 'child_process';
import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { eq } from 'drizzle-orm';

// The scanner script lives next to the Next standalone server in the
// production image (/app); in local dev it sits at the project root.
const SCAN_CWD = process.env.SCAN_CWD ?? (process.env.NODE_ENV === 'production' ? '/app' : process.cwd());

/**
 * Spawn fast_scan.py as a detached child and wire up bookkeeping: record the
 * pid, keep a small tail of stderr for diagnostics, and finalize finished_at on
 * exit. Shared by the start endpoint and the resume-on-boot reconciler so both
 * behave identically.
 */
export function launchScanner(runId: number, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn('python3', args, {
    cwd: SCAN_CWD,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });

  child.unref();

  if (child.pid) {
    db.update(scanRuns)
      .set({ scannerPid: child.pid })
      .where(eq(scanRuns.id, runId))
      .catch((err) => console.error(`Failed to record pid for run_id=${runId}`, err));
  }

  // Keep only the last 2KB of stderr to avoid unbounded memory growth.
  let stderr = '';
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', (d: Buffer) => {
    stderr += d.toString();
    if (stderr.length > 4000) stderr = stderr.slice(-2000);
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Scan run_id=${runId} exited with code ${code}`);
      console.error(stderr.slice(-2000));
    }
    db.update(scanRuns)
      .set({ finishedAt: new Date(), scannerPid: null })
      .where(eq(scanRuns.id, runId))
      .catch((err) => console.error(`Failed to finalize scan run_id=${runId}`, err));
  });

  return child;
}
