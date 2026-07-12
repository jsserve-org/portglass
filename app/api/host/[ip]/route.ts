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

  // MaxMind enrichment: country + (city/lat/lng if the City edition is loaded)
  // + ASN/org for this IP. Each field is an independent longest-prefix lookup so
  // an IP with an ASN but no geo row (or vice-versa) still returns what it has.
  const geoRows = await db.execute(sql`
    WITH geo AS (SELECT * FROM geo_blocks WHERE network >>= ${ip}::inet ORDER BY masklen(network) DESC LIMIT 1)
    SELECT
      (SELECT country_iso FROM geo) as country_iso,
      (SELECT country_name FROM geo) as country_name,
      (SELECT city_name FROM geo) as city_name,
      (SELECT latitude FROM geo) as latitude,
      (SELECT longitude FROM geo) as longitude,
      (SELECT asn FROM asn_blocks WHERE network >>= ${ip}::inet ORDER BY masklen(network) DESC LIMIT 1) as asn,
      (SELECT org FROM asn_blocks WHERE network >>= ${ip}::inet ORDER BY masklen(network) DESC LIMIT 1) as org
  `);
  const g = (geoRows.rows[0] as any) ?? {};

  return NextResponse.json({
    ip,
    // Public Mapbox token, injected at runtime from server env (kept out of the
    // bundle/source so it isn't committed).
    mapboxToken: process.env.MAPBOX_TOKEN || '',
    geo: {
      countryIso: g.country_iso ? String(g.country_iso) : null,
      countryName: g.country_name ? String(g.country_name) : null,
      city: g.city_name ? String(g.city_name) : null,
      latitude: g.latitude != null ? Number(g.latitude) : null,
      longitude: g.longitude != null ? Number(g.longitude) : null,
      asn: g.asn != null ? Number(g.asn) : null,
      org: g.org ? String(g.org) : null,
    },
    findings: findings.map((f) => ({
      ...f,
      run: f.runId ? runsMap.get(f.runId) || null : null,
    })),
  });
}
