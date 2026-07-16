import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { deviceTypeCounts } from '@/lib/device-counts';

// GET /api/device-types — count of hosts per auto-detected device type, read
// from the pre-labelled host_devices table (materialized at boot + after each
// scan). "unknown" hosts aren't stored, so they're naturally excluded.
export async function GET() {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await deviceTypeCounts();
  return Response.json(payload, {
    headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' },
  });
}
