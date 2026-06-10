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
}
