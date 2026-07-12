import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scanRuns, portFindings } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq, desc, sql } from 'drizzle-orm';
import { junkMatchSql } from '@/lib/junk';
import { deviceTypeCaseSql } from '@/lib/classify-sql';

function ipCountFromCidr(cidr: string): number {
  try {
    const [ipPart, prefix] = cidr.split('/');
    const p = parseInt(prefix, 10);
    if (isNaN(p) || p < 0 || p > 32) return 0;
    const parts = ipPart.split('.').map((n) => parseInt(n, 10));
    if (parts.length !== 4 || parts.some((n) => isNaN(n))) return 0;
    if (p >= 31) return 1;
    return Math.max(1, Math.pow(2, 32 - p) - 2);
  } catch {
    return 0;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { id } = await params;
  const runId = parseInt(id, 10);
  if (isNaN(runId)) {
    return NextResponse.json({ error: 'Invalid scan ID' }, { status: 400 });
  }

  const run = await db.select().from(scanRuns).where(eq(scanRuns.id, runId)).limit(1);
  if (!run.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const findings = await db
    .select()
    .from(portFindings)
    .where(eq(portFindings.runId, runId))
    .orderBy(desc(portFindings.observedAt))
    .limit(500);

  const hostCount = new Set(findings.map((f) => f.ip)).size;
  const serviceMap: Record<string, number> = {};
  for (const f of findings) {
    const key = f.service || f.banner?.split(' ')[0] || `Port ${f.port}`;
    serviceMap[key] = (serviceMap[key] || 0) + 1;
  }
  const topServices = Object.entries(serviceMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // MaxMind enrichment for the scanned network: use a representative IP (first
  // finding, else the CIDR base address) so the header can show country + ASN.
  const lookupIp = findings[0]?.ip ?? run[0].cidr.split('/')[0];
  let geo = { countryIso: null as string | null, countryName: null as string | null, asn: null as number | null, org: null as string | null };
  try {
    const geoRows = await db.execute(sql`
      SELECT
        (SELECT country_iso FROM geo_blocks WHERE network >>= ${lookupIp}::inet ORDER BY masklen(network) DESC LIMIT 1) as country_iso,
        (SELECT country_name FROM geo_blocks WHERE network >>= ${lookupIp}::inet ORDER BY masklen(network) DESC LIMIT 1) as country_name,
        (SELECT asn FROM asn_blocks WHERE network >>= ${lookupIp}::inet ORDER BY masklen(network) DESC LIMIT 1) as asn,
        (SELECT org FROM asn_blocks WHERE network >>= ${lookupIp}::inet ORDER BY masklen(network) DESC LIMIT 1) as org
    `);
    const g = (geoRows.rows[0] as any) ?? {};
    geo = {
      countryIso: g.country_iso ? String(g.country_iso) : null,
      countryName: g.country_name ? String(g.country_name) : null,
      asn: g.asn != null ? Number(g.asn) : null,
      org: g.org ? String(g.org) : null,
    };
  } catch {
    // geo tables may be empty/unavailable; header simply omits the badges
  }

  // Per-scan device-type breakdown: classify only THIS run's hosts (a host may
  // appear in other scans too) with the shared SQL classifier.
  let deviceCounts: { device_type: string; count: number }[] = [];
  try {
    const dc = await db.execute(sql`
      SELECT device_type, COUNT(*)::int AS count
      FROM (
        SELECT ip, ${deviceTypeCaseSql()} AS device_type
        FROM port_findings
        WHERE run_id = ${runId} AND NOT ${junkMatchSql()}
        GROUP BY ip
      ) t
      WHERE device_type <> 'unknown'
      GROUP BY device_type
      ORDER BY count DESC
    `);
    deviceCounts = dc.rows as { device_type: string; count: number }[];
  } catch {
    // classifier tables/regex issues should never break the scan page
  }

  const runData = run[0];
  const totalHosts = ipCountFromCidr(runData.cidr);
  const portsCount = runData.ports.split(',').length;
  const totalTargets = totalHosts * portsCount;
  const elapsedSec = Math.round((Date.now() - new Date(runData.startedAt).getTime()) / 1000);
  const estimatedTotalSec = totalTargets > 0 ? Math.round(totalTargets / 250) : 0;
  const etaSec = !runData.finishedAt && estimatedTotalSec > 0
    ? Math.max(0, estimatedTotalSec - elapsedSec)
    : 0;

  return NextResponse.json({
    run: runData,
    geo,
    findings,
    deviceCounts,
    stats: {
      totalFindings: findings.length,
      hosts: hostCount,
      topServices,
      elapsedSec,
      estimatedTotalSec,
      etaSec,
    },
  });
}
