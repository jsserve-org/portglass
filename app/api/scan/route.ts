import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { launchScanner } from '@/lib/scanner';

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
  const deep = !!body.deep;
  // Defaults are deliberately gentle: this app commonly runs on a small host
  // shared with other services, so a scan must not monopolise it. The scanner
  // is also spawned at low CPU priority (see lib/scanner.ts) and the container
  // is memory-capped. Users who want a faster sweep can raise these in Advanced.
  const threads = Math.min(Math.max(parseInt(body.threads ?? '2', 10), 1), 8);
  const concurrency = Math.min(Math.max(parseInt(body.concurrency ?? '150', 10), 1), 2048);
  const timeout = Math.min(Math.max(parseFloat(body.timeout ?? '0.8'), 0.1), 10);
  const rate = Math.min(Math.max(parseFloat(body.rate ?? '300'), 0), 10000);
  // Deep mode trades speed for richer fingerprints: read banners on every open
  // port (not just HTTP), re-probe once to merge the best result, and allow a
  // longer read window so slow services finish their greeting/response.
  const stealth = !!body.stealth;
  // Fast mode is a speed-first sweep: it forces banner/verify off (the scanner
  // also enforces this) and is mutually exclusive with the low-and-slow mode.
  const fast = !!body.fast && !stealth;
  const verifyRetries = fast ? 0 : Math.min(Math.max(parseInt(body.verifyRetries ?? (deep ? '1' : '0'), 10), 0), 5);
  const banner = !fast && (!!body.banner || deep);
  const proxy = String(body.proxy ?? '').trim();
  const discover = !!body.discover;
  const readTimeout = Math.min(Math.max(parseFloat(body.readTimeout ?? (deep ? '5.0' : '3.0')), 0.5), 15);

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
    '--read-timeout', String(readTimeout),
    '--yes-i-own-this-network',
    '--no-csv',
    '--run-id', String(runId),
  ];
  if (verifyRetries > 0) args.push('--verify-retries', String(verifyRetries));
  if (banner) args.push('--banner');
  if (stealth) args.push('--stealth');
  if (fast) args.push('--fast');
  if (proxy) {
    args.push('--proxy', proxy);
    env['SCAN_PROXY'] = proxy;
  }
  if (discover) args.push('--discover');

  // Persist the argv so an interrupted run can be resumed verbatim on boot.
  await db
    .update(scanRuns)
    .set({ scanArgs: JSON.stringify(args) })
    .where(eq(scanRuns.id, runId));

  launchScanner(runId, args, env);

  return NextResponse.json({ runId, status: 'started' });
}
