import { db } from '@/lib/db';
import { scanSchedules } from '@/lib/schema';
import { and, eq, lte } from 'drizzle-orm';
import { createScanRun, type ScanInput } from '@/lib/scan-launch';

// The set of scan knobs a schedule can carry (everything but the target, which
// lives in its own columns). Stored as JSON so adding a knob needs no migration.
export type ScheduleOptions = Omit<ScanInput, 'cidr' | 'ports' | 'label'>;

/**
 * Launch every enabled schedule whose nextRunAt has passed, then advance its
 * clock. Called once a minute by the server tick. Guards against a wedged skip
 * subnet / bad CIDR by advancing the schedule even when the launch is rejected,
 * so one bad schedule can't be retried in a tight loop.
 */
export async function runDueSchedules(now = new Date()): Promise<number> {
  const due = await db
    .select()
    .from(scanSchedules)
    .where(and(eq(scanSchedules.enabled, true), lte(scanSchedules.nextRunAt, now)));

  let launched = 0;
  for (const s of due) {
    let options: ScheduleOptions = {};
    if (s.options) {
      try {
        options = JSON.parse(s.options) as ScheduleOptions;
      } catch {
        options = {};
      }
    }

    let lastRunId: number | null = null;
    try {
      const result = await createScanRun({
        ...options,
        cidr: s.cidr,
        ports: s.ports,
        label: s.label ?? undefined,
      });
      if (result.ok) {
        lastRunId = result.runId;
        launched++;
      } else {
        console.error(`schedule ${s.id} rejected: ${result.error}`);
      }
    } catch (err) {
      console.error(`schedule ${s.id} failed to launch`, err);
    }

    // Advance the clock relative to now (not the missed slot) so a server that
    // was down for a while doesn't fire a burst of catch-up scans.
    const next = new Date(now.getTime() + s.intervalMinutes * 60_000);
    await db
      .update(scanSchedules)
      .set({
        nextRunAt: next,
        lastRunAt: now,
        ...(lastRunId != null ? { lastRunId } : {}),
      })
      .where(eq(scanSchedules.id, s.id))
      .catch((e) => console.error(`schedule ${s.id} advance failed`, e));
  }

  return launched;
}
