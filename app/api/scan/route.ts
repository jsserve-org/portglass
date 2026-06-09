import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';

function validateCIDR(cidr: string): boolean {
  try {
    const [ip, prefix] = cidr.split('/');
    if (!ip || !prefix) return false;
    const p = parseInt(prefix, 10);
    if (isNaN(p) || p < 8 || p > 32) return false;
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    for (const part of parts) {
      const n = parseInt(part, 10);
      if (isNaN(n) || n < 0 || n > 255) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const cidr = String(body.cidr ?? '').trim();
  if (!cidr || !validateCIDR(cidr)) {
    return NextResponse.json({ error: 'Invalid CIDR. Use IPv4 format like 192.168.0.0/24' }, { status: 400 });
  }

  const ports = String(body.ports ?? 'common').trim();
  const threads = Math.min(Math.max(parseInt(body.threads ?? '4', 10), 1), 32);
  const concurrency = Math.min(Math.max(parseInt(body.concurrency ?? '512', 10), 1), 4096);
  const timeout = Math.min(Math.max(parseFloat(body.timeout ?? '0.8'), 0.1), 10);
  const rate = Math.min(Math.max(parseFloat(body.rate ?? '250'), 0), 10000);
  const verifyRetries = Math.min(Math.max(parseInt(body.verifyRetries ?? '0', 10), 0), 5);
  const banner = !!body.banner;

  // Insert scan_runs record so we know the run_id immediately
  const [run] = await db
    .insert(scanRuns)
    .values({
      cidr,
      ports,
      startedAt: new Date(),
      scannerVersion: 'fast_scan.py',
    })
    .returning({ id: scanRuns.id });

  const runId = run.id;

  const env = { ...process.env } as NodeJS.ProcessEnv;
  const args = [
    'fast_scan.py',
    cidr,
    '-p', ports,
    '--threads', String(threads),
    '--concurrency', String(concurrency),
    '--timeout', String(timeout),
    '--rate', String(rate),
    '--yes-i-own-this-network',
    '--no-csv',
    '--run-id', String(runId),
  ];
  if (verifyRetries > 0) args.push('--verify-retries', String(verifyRetries));
  if (banner) args.push('--banner');

  const child = spawn('python3', args, {
    cwd: '/app',
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });

  child.unref();

  // Minimal logging (keep only last 2KB to avoid memory growth)
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
  });

  return NextResponse.json({ runId, status: 'started' });
}
