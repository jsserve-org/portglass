import { db } from '@/lib/db';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';
import { cached } from '@/lib/cache';

// GET /api/device-types — count of hosts per auto-detected device type, read
// from the pre-labelled host_devices table (materialized at boot + after each
// scan). "unknown" hosts aren't stored, so they're naturally excluded.
export async function GET() {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await cached('device-types', 30_000, async () => {
    const res = await db.execute(sql`
      SELECT device_type, COUNT(*)::int AS count
      FROM host_devices
      GROUP BY device_type
      ORDER BY count DESC
    `);
    return { types: res.rows as { device_type: string; count: number }[] };
  });

  return Response.json(payload);
}
