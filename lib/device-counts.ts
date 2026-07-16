import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { cached } from '@/lib/cache';
import type { DeviceType } from '@/lib/classify';

export type DeviceTypeCount = { device_type: DeviceType; count: number };

// Per-device-type host counts, read from the pre-labelled host_devices table
// (materialized at boot + after each scan). Cached 30s and shared by the
// /api/device-types endpoint and the server-rendered Devices page, so the page
// paints with real numbers on first byte instead of after a client fetch.
export function deviceTypeCounts(): Promise<{ types: DeviceTypeCount[] }> {
  return cached('device-types', 30_000, async () => {
    const res = await db.execute(sql`
      SELECT device_type, COUNT(*)::int AS count
      FROM host_devices
      GROUP BY device_type
      ORDER BY count DESC
    `);
    return { types: res.rows as DeviceTypeCount[] };
  });
}
