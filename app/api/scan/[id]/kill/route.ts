import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';

const execFileAsync = promisify(execFile);

function pidIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Async so a slow pgrep can't freeze the whole event loop for up to 2s
// (every request + WS heartbeat stalls behind a sync spawn).
async function findScannerPids(runId: number): Promise<number[]> {
  const pids = new Set<number>();
  try {
    const { stdout } = await execFileAsync('pgrep', ['-f', `fast_scan.py.*--run-id ${runId}`], {
      timeout: 2000,
    });
    for (const line of stdout.split(/\s+/)) {
      const pid = Number(line.trim());
      if (Number.isInteger(pid) && pid > 1 && pid !== process.pid) pids.add(pid);
    }
  } catch {
    // pgrep exits non-zero when nothing matched.
  }
  return [...pids];
}

async function forceKillPid(pid: number) {
  // Scans are spawned detached, so -pid targets the scanner's process group.
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, 'SIGTERM');
    } catch {
      // Already gone or not a process group. Try the next target.
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 900));

  if (pidIsAlive(pid)) {
    for (const target of [-pid, pid]) {
      try {
        process.kill(target, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { id } = await context.params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId <= 0) {
    return NextResponse.json({ error: 'Invalid scan id' }, { status: 400 });
  }

  const [run] = await db.select().from(scanRuns).where(eq(scanRuns.id, runId)).limit(1);
  if (!run) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  const pids = new Set<number>();
  if (run.scannerPid && run.scannerPid > 1) pids.add(run.scannerPid);
  for (const pid of await findScannerPids(runId)) pids.add(pid);

  // Kill concurrently instead of serializing a 900ms grace wait per pid.
  await Promise.all([...pids].map((pid) => forceKillPid(pid)));

  const killedPids = [...pids];
  await db
    .update(scanRuns)
    .set({
      finishedAt: new Date(),
      scannerPid: null,
      notes: `${run.notes ? `${run.notes}\n` : ''}Force killed port scanning at ${new Date().toISOString()}${killedPids.length ? ` (pid ${killedPids.join(', ')})` : ''}`,
    })
    .where(eq(scanRuns.id, runId));

  return NextResponse.json({ success: true, killedPids });
}
