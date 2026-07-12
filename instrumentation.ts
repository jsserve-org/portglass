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
    // Backfill device labels for everything already scanned (and reconcile any
    // drift from schema/classifier changes) on boot.
    const { refreshHostDevices } = await import('@/lib/host-devices');
    const n = await refreshHostDevices();
    if (n >= 0) console.log(`> host_devices backfilled (${n} labelled hosts)`);
  } catch (err) {
    console.error('instrumentation: refreshHostDevices failed', err);
  }
}
