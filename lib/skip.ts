import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// Skip subnets: ranges the operator never wants scanned. Postgres `inet`
// operators handle both IPv4 and IPv6, so we do the containment/overlap tests
// in SQL rather than reimplementing CIDR math in JS.

/** True if `cidr` is entirely inside some skip subnet (so a scan is pointless). */
export async function isFullyCoveredBySkip(cidr: string): Promise<boolean> {
  try {
    const r = await db.execute(
      sql`SELECT 1 FROM skip_subnets WHERE cidr::inet >>= ${cidr}::inet LIMIT 1`,
    );
    return r.rows.length > 0;
  } catch {
    // If the input can't be cast to inet, treat it as not-covered; the scan
    // endpoint's own validation will reject a truly malformed CIDR.
    return false;
  }
}

/** Skip subnets that overlap `cidr` — the ones worth passing to the scanner. */
export async function overlappingSkips(cidr: string): Promise<string[]> {
  try {
    const r = await db.execute(
      sql`SELECT cidr FROM skip_subnets WHERE cidr::inet && ${cidr}::inet`,
    );
    return r.rows.map((row) => String((row as any).cidr));
  } catch {
    return [];
  }
}
