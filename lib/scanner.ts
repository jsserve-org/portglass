import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { eq } from 'drizzle-orm';

// The scanner script lives next to the Next standalone server in the
// production image (/app); in local dev it sits at the project root.
const SCAN_CWD = process.env.SCAN_CWD ?? (process.env.NODE_ENV === 'production' ? '/app' : process.cwd());

// Run the scanner at a low CPU priority so a scan can never starve the rest of
// the (small, shared) host of CPU. Detected once; falls back to a plain spawn
// where `nice` isn't present.
const NICE_BIN = ['/usr/bin/nice', '/bin/nice'].find((p) => existsSync(p));

/**
 * Spawn fast_scan.py as a detached child and wire up bookkeeping: record the
 * pid, keep a small tail of stderr for diagnostics, and finalize finished_at on
 * exit. Shared by the start endpoint and the resume-on-boot reconciler so both
 * behave identically.
 */
export function launchScanner(runId: number, args: string[], env: NodeJS.ProcessEnv) {
  const [cmd, cmdArgs] = NICE_BIN
    ? [NICE_BIN, ['-n', '15', 'python3', ...args]]
    : ['python3', args];
  const child = spawn(cmd, cmdArgs, {
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
      .catch((err) => console.error(`Failed to finalize scan run_id=${runId}`, err))
      .finally(() => {
        // A slot just freed — start the next queued scan. Dynamic import avoids
        // a static cycle (queue.ts imports launchScanner from here).
        import('@/lib/queue')
          .then((m) => m.dispatchQueued())
          .catch((err) => console.error('dispatchQueued after exit failed', err));
        // Refresh persisted device labels for the hosts this scan just found.
        import('@/lib/host-devices')
          .then((m) => m.refreshHostDevices())
          .catch((err) => console.error('refreshHostDevices after exit failed', err));
      });
  });

  return child;
}
