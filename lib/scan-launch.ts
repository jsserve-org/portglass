import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { requestScan } from '@/lib/queue';
import { invalidate } from '@/lib/cache';
import { isValidCidr } from '@/lib/cidr';
import { isFullyCoveredBySkip, overlappingSkips } from '@/lib/skip';

// Raw, user-supplied scan options. Everything is optional except cidr; the same
// shape is used by the /api/scan endpoint (from the request body) and by the
// scheduler (from a stored schedule's JSON options), so scan launching lives in
// exactly one place.
export type ScanInput = {
  cidr: string;
  ports?: string;
  label?: string | null;
  deep?: boolean;
  stealth?: boolean;
  fast?: boolean;
  discover?: boolean;
  banner?: boolean;
  threads?: number | string;
  concurrency?: number | string;
  timeout?: number | string;
  rate?: number | string;
  readTimeout?: number | string;
  verifyRetries?: number | string;
  proxy?: string;
  // Per-scan ranges to skip (comma/space/newline separated, or an array). These
  // are excluded for THIS scan only, on top of the global skip-subnet list.
  exclude?: string | string[];
};

export type CreateScanResult =
  | { ok: true; runId: number; state: 'started' | 'queued' }
  | { ok: false; error: string; status: number };

const clampInt = (v: unknown, def: number, lo: number, hi: number) =>
  Math.min(Math.max(parseInt(String(v ?? def), 10) || def, lo), hi);
const clampFloat = (v: unknown, def: number, lo: number, hi: number) =>
  Math.min(Math.max(parseFloat(String(v ?? def)) || def, lo), hi);

/** Split a user-supplied exclude list (array, or comma/space/newline text). */
function parseExcludeList(v: unknown): string[] {
  if (!v) return [];
  const parts = Array.isArray(v) ? v : String(v).split(/[\s,]+/);
  return [...new Set(parts.map((s) => String(s).trim()).filter(Boolean))];
}

/**
 * Validate options, build the fast_scan.py argv (honoring skip subnets), insert
 * the scan_runs row, and hand it to the queue. Shared by the manual endpoint and
 * the recurring scheduler.
 */
export async function createScanRun(input: ScanInput): Promise<CreateScanResult> {
  const cidr = String(input.cidr ?? '').trim();
  if (!cidr || !isValidCidr(cidr)) {
    return { ok: false, error: 'Invalid CIDR. Use IPv4 (192.168.0.0/24) or IPv6 (2001:db8::/112).', status: 400 };
  }

  // Per-scan exclude ranges — validate each up front so a typo is a clear error
  // rather than a silently-ignored range.
  const perScanExcludes = parseExcludeList(input.exclude);
  for (const c of perScanExcludes) {
    if (!isValidCidr(c)) {
      return { ok: false, error: `Invalid exclude range: ${c}`, status: 400 };
    }
  }

  // Refuse a scan that lands entirely inside a skip subnet — it would waste the
  // whole run's resources for zero useful findings.
  if (await isFullyCoveredBySkip(cidr)) {
    return { ok: false, error: 'This range is fully inside a skip subnet and will not be scanned.', status: 409 };
  }

  const ports = String(input.ports ?? 'common').trim() || 'common';
  const label = String(input.label ?? '').trim().slice(0, 80) || null;
  const deep = !!input.deep;
  // Defaults are deliberately gentle: this app commonly runs on a small shared
  // host, so a scan must not monopolise it. The scanner is also spawned at low
  // CPU priority and the container is memory-capped.
  const threads = clampInt(input.threads, 2, 1, 8);
  const concurrency = clampInt(input.concurrency, 150, 1, 2048);
  const timeout = clampFloat(input.timeout, 0.8, 0.1, 10);
  const rate = clampFloat(input.rate, 300, 0, 10000);
  const stealth = !!input.stealth;
  // Fast mode forces banner/verify off and is mutually exclusive with stealth.
  const fast = !!input.fast && !stealth;
  const verifyRetries = fast ? 0 : clampInt(input.verifyRetries, deep ? 1 : 0, 0, 5);
  const banner = !fast && (!!input.banner || deep);
  const proxy = String(input.proxy ?? '').trim();
  const discover = !!input.discover;
  const readTimeout = clampFloat(input.readTimeout, deep ? 5.0 : 3.0, 0.5, 15);

  const [run] = await db
    .insert(scanRuns)
    .values({ cidr, label, ports, startedAt: new Date(), scannerVersion: 'fast_scan.py' })
    .returning({ id: scanRuns.id });
  const runId = run.id;

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
  if (proxy) args.push('--proxy', proxy);
  if (discover) args.push('--discover');

  // Skip both the user's per-scan exclude ranges and any global skip subnets
  // that overlap this range, so the scanner drops those addresses unprobed.
  const globalSkips = await overlappingSkips(cidr);
  const excludes = [...new Set([...perScanExcludes, ...globalSkips])];
  if (excludes.length) args.push('--exclude', excludes.join(','));

  await db.update(scanRuns).set({ scanArgs: JSON.stringify(args) }).where(eq(scanRuns.id, runId));

  const state = await requestScan(runId);

  invalidate('runs');
  invalidate('stats');

  return { ok: true, runId, state };
}
