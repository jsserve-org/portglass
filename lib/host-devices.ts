import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { junkMatchSql } from '@/lib/junk';
import { deviceTypeCaseSql } from '@/lib/classify-sql';
import { invalidate } from '@/lib/cache';

// Materialize per-host device classification into host_devices. Recomputes
// hosts from their findings with the SQL classifier so already-scanned hosts
// are "pre-labelled" and the sidebar filter / counts / badges become index
// lookups instead of a full-table aggregation. Only non-"unknown" hosts are
// stored (absent row = unknown).
//
// Called at boot (instrumentation.ts) with no argument for a full rebuild, and
// after each scan completes (lib/scanner.ts) with the finished run id for an
// incremental refresh: only the IPs that scan touched are recomputed (over all
// of their findings, preserving history), then their rows are replaced. A full
// rebuild after every scan used to re-run the ~19-branch regex classifier over
// the entire findings table — a recurring multi-second CPU spike that grew
// with total data rather than with the scan size.
let running = false;

export async function refreshHostDevices(runId?: number): Promise<number> {
  // Coalesce concurrent calls (e.g. several scans finishing at once): a
  // rebuild already in flight will pick up their data, so skipping is safe.
  if (running) return -1;
  running = true;
  try {
    let inserted = 0;
    await db.transaction(async (tx) => {
      if (runId == null) {
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
      } else {
        // Incremental: classify only hosts this run observed. Labels are still
        // computed over ALL findings per IP so older evidence isn't lost. Two
        // steps inside one transaction: drop this run's hosts' rows, then
        // insert fresh labels for whichever of them still classify as known.
        await tx.execute(sql`
          DELETE FROM host_devices h
          WHERE EXISTS (
            SELECT 1 FROM port_findings pf
            WHERE pf.run_id = ${runId} AND pf.ip = h.ip
          )
        `);
        const ins = await tx.execute(sql`
          INSERT INTO host_devices (ip, device_type, updated_at)
          SELECT ip, device_type, now()
          FROM (
            SELECT ip, ${deviceTypeCaseSql()} AS device_type
            FROM port_findings
            WHERE ip IN (SELECT DISTINCT ip FROM port_findings WHERE run_id = ${runId})
              AND NOT ${junkMatchSql()}
            GROUP BY ip
          ) t
          WHERE device_type <> 'unknown'
        `);
        inserted = ins.rowCount ?? 0;
      }
    });
    // Counts + result pages depend on these labels; drop their cached copies.
    invalidate('device-types');
    invalidate('findings');
    return inserted;
  } finally {
    running = false;
  }
}
