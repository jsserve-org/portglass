import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scanSchedules } from '@/lib/schema';
import { desc } from 'drizzle-orm';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { isValidCidr } from '@/lib/cidr';
import { type ScheduleOptions } from '@/lib/schedules';
import { createScanRun } from '@/lib/scan-launch';
import { invalidate } from '@/lib/cache';

async function requireSession() {
  if (!authEnabled) return true;
  const session = await auth.api.getSession({ headers: await headers() });
  return !!session;
}

export async function GET() {
  if (!(await requireSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await db.select().from(scanSchedules).orderBy(desc(scanSchedules.createdAt));
  return NextResponse.json({ schedules: rows });
}

export async function POST(request: Request) {
  if (!(await requireSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const cidr = String(body.cidr ?? '').trim();
  if (!cidr || !isValidCidr(cidr)) {
    return NextResponse.json({ error: 'Invalid CIDR' }, { status: 400 });
  }

  const intervalMinutes = Math.min(Math.max(parseInt(String(body.intervalMinutes ?? ''), 10) || 0, 15), 60 * 24 * 30);
  if (!intervalMinutes) {
    return NextResponse.json({ error: 'intervalMinutes must be at least 15' }, { status: 400 });
  }

  const ports = String(body.ports ?? 'common').trim() || 'common';
  const label = String(body.label ?? '').trim().slice(0, 80) || null;
  const runNow = !!body.runNow;

  // Only carry the scan knobs, not target fields, into options.
  const opts: ScheduleOptions = {};
  for (const k of ['deep', 'stealth', 'fast', 'discover', 'banner'] as const) {
    if (body[k]) (opts as any)[k] = true;
  }
  // Persist per-scan exclude ranges so every recurring run skips them too.
  if (typeof body.exclude === 'string' && body.exclude.trim()) opts.exclude = body.exclude.trim();
  else if (Array.isArray(body.exclude) && body.exclude.length) opts.exclude = body.exclude;
  // Persist excluded ports too, so recurring runs never probe them.
  if (typeof body.excludePorts === 'string' && body.excludePorts.trim()) {
    opts.excludePorts = body.excludePorts.trim();
  }

  const now = new Date();
  const next = new Date(now.getTime() + intervalMinutes * 60_000);
  const [row] = await db
    .insert(scanSchedules)
    .values({
      cidr,
      ports,
      label,
      intervalMinutes,
      options: Object.keys(opts).length ? JSON.stringify(opts) : null,
      // Launched immediately below when runNow, so the clock starts one interval
      // out; otherwise the first run is one interval from now too.
      nextRunAt: next,
    })
    .returning();

  // Fire the first run right away so the user sees results immediately instead
  // of waiting up to a minute for the scheduler tick.
  if (runNow) {
    const result = await createScanRun({ ...opts, cidr, ports, label: label ?? undefined });
    if (result.ok) {
      await db
        .update(scanSchedules)
        .set({ lastRunAt: now, lastRunId: result.runId })
        .where(eq(scanSchedules.id, row.id))
        .catch(() => {});
    } else {
      // Don't strand a schedule the very first run rejects (e.g. skip-covered).
      await db.delete(scanSchedules).where(eq(scanSchedules.id, row.id));
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
  }

  invalidate('schedules');
  return NextResponse.json({ schedule: row });
}
