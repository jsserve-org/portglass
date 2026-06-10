import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { portFindings, scanRuns } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq, desc, sql } from 'drizzle-orm';

export async function GET(_request: Request, { params }: { params: Promise<{ ip: string }> }) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { ip } = await params;
  if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return NextResponse.json({ error: 'Invalid IP' }, { status: 400 });
  }

  const findings = await db
    .select()
    .from(portFindings)
    .where(eq(portFindings.ip, ip))
    .orderBy(desc(portFindings.observedAt))
    .limit(500);

  const runsMap = new Map<number, typeof scanRuns.$inferSelect>();
  const runIds = [...new Set(findings.map((f) => f.runId).filter(Boolean) as number[])];
  if (runIds.length) {
    const runs = await db.select().from(scanRuns).where(eq(scanRuns.id, runIds[0]));
    for (const r of runs) runsMap.set(r.id, r);
  }

  // MaxMind enrichment: country (location) + ASN/org for this IP.
  const geoRows = await db.execute(sql`
    SELECT
      (SELECT country_iso FROM geo_blocks WHERE network >>= ${ip}::inet ORDER BY masklen(network) DESC LIMIT 1) as country_iso,
      (SELECT country_name FROM geo_blocks WHERE network >>= ${ip}::inet ORDER BY masklen(network) DESC LIMIT 1) as country_name,
      (SELECT asn FROM asn_blocks WHERE network >>= ${ip}::inet ORDER BY masklen(network) DESC LIMIT 1) as asn,
      (SELECT org FROM asn_blocks WHERE network >>= ${ip}::inet ORDER BY masklen(network) DESC LIMIT 1) as org
  `);
  const g = (geoRows.rows[0] as any) ?? {};

  return NextResponse.json({
    ip,
    geo: {
      countryIso: g.country_iso ? String(g.country_iso) : null,
      countryName: g.country_name ? String(g.country_name) : null,
      asn: g.asn != null ? Number(g.asn) : null,
      org: g.org ? String(g.org) : null,
    },
    findings: findings.map((f) => ({
      ...f,
      run: f.runId ? runsMap.get(f.runId) || null : null,
    })),
  });
}
