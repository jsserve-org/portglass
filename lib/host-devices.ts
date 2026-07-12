import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { junkMatchSql } from '@/lib/junk';
import { deviceTypeCaseSql } from '@/lib/classify-sql';
import { invalidate } from '@/lib/cache';

// Materialize per-host device classification into host_devices. Recomputes every
// host from its findings with the SQL classifier and replaces the table
// contents atomically, so already-scanned hosts are "pre-labelled" and the
// sidebar filter / counts / badges become index lookups instead of a full-table
// aggregation. Only non-"unknown" hosts are stored (absent row = unknown).
//
// Called at boot (instrumentation.ts) and after each scan completes
// (lib/scanner.ts). The table is small (one row per host), so a full rebuild in
// a single transaction is cheap and keeps it consistent (handles hosts that
// changed type or dropped to unknown without stale-row bookkeeping).
let running = false;

export async function refreshHostDevices(): Promise<number> {
  // Coalesce concurrent calls (e.g. several scans finishing at once): a rebuild
  // already in flight will pick up their data, so skipping is safe.
  if (running) return -1;
  running = true;
  try {
    let inserted = 0;
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM host_devices`);
      const res = await tx.execute(sql`
        INSERT INTO host_devices (ip, device_type, updated_at)
        SELECT ip, device_type, now()
        FROM (
          SELECT ip, ${deviceTypeCaseSql()} AS device_type
          FROM port_findings
          WHERE NOT ${junkMatchSql()}
          GROUP BY ip
        ) t
        WHERE device_type <> 'unknown'
      `);
      inserted = res.rowCount ?? 0;
    });
    // Counts + result pages depend on these labels; drop their cached copies.
    invalidate('device-types');
    invalidate('findings');
    return inserted;
  } finally {
    running = false;
  }
}
