import 'server-only';
import { lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getShodanHostIntel, isShodanConfigured } from '@/lib/shodan';
import { shodanHostCache } from '@/lib/schema';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Automatically compare a bounded set of US hosts from a completed scan with
// Shodan's pre-existing minified service summary. This is intentionally not a
// bulk mirror: default 25 unique hosts/run, sequential requests, 24h cache.
export async function enrichScanWithShodan(runId: number): Promise<number> {
  if (!isShodanConfigured()) return 0;
  const configured = Number.parseInt(process.env.SHODAN_AUTO_ENRICH_LIMIT || '25', 10);
  const limit = Math.min(Math.max(Number.isFinite(configured) ? configured : 25, 0), 100);
  if (!limit) return 0;

  await db.delete(shodanHostCache).where(lt(shodanHostCache.expiresAt, new Date()));

  const rows = await db.execute(sql`
    SELECT DISTINCT pf.ip
    FROM port_findings pf
    WHERE pf.run_id = ${runId}
      AND EXISTS (
        SELECT 1 FROM geo_blocks gb
        WHERE gb.network >>= pf.ip::inet AND gb.country_iso = 'US'
      )
    ORDER BY pf.ip
    LIMIT ${limit}
  `);

  let enriched = 0;
  for (const row of rows.rows as { ip: string }[]) {
    try {
      await getShodanHostIntel(String(row.ip), { runId });
      enriched++;
    } catch (error) {
      console.warn(`Shodan auto-enrichment failed for ${row.ip}:`, error instanceof Error ? error.message : error);
    }
    await sleep(1000);
  }
  if (enriched) console.log(`> Shodan enriched ${enriched} US host(s) for run_id=${runId}`);
  return enriched;
}
