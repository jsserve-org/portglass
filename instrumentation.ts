// Next.js runs register() once when the server process starts. We use it to
// resume scans that were interrupted by a previous container being killed.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { resumeOrphanedScans } = await import('@/lib/resume');
    await resumeOrphanedScans();
  } catch (err) {
    // Never let startup reconciliation crash the server boot.
    console.error('instrumentation: resumeOrphanedScans failed', err);
  }
  try {
    // geo_blocks is a raw (non-Drizzle) table; ensure the city/lat/lng columns
    // exist so the location map + host page can read them (populated when the
    // MaxMind City edition is imported; null under the Country edition).
    const { db } = await import('@/lib/db');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`ALTER TABLE geo_blocks
      ADD COLUMN IF NOT EXISTS city_name text,
      ADD COLUMN IF NOT EXISTS latitude double precision,
      ADD COLUMN IF NOT EXISTS longitude double precision`);
  } catch (err) {
    console.error('instrumentation: ensure geo columns failed', err);
  }
  try {
    // Backfill device labels for everything already scanned (and reconcile any
    // drift from schema/classifier changes) on boot.
    const { refreshHostDevices } = await import('@/lib/host-devices');
    const n = await refreshHostDevices();
    if (n >= 0) console.log(`> host_devices backfilled (${n} labelled hosts)`);
  } catch (err) {
    console.error('instrumentation: refreshHostDevices failed', err);
  }
}
