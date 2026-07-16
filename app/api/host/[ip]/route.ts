import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { inArray, sql } from 'drizzle-orm';
import { cached } from '@/lib/cache';

// Accept both IPv4 (1.2.3.4) and IPv6 (colon-hex, optionally with an embedded
// v4 tail). The value is only ever bound as a query parameter, never
// interpolated, so this is a sanity gate rather than an injection guard.
const V4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const V6 = /^[0-9a-fA-F:]+(:\d{1,3}(\.\d{1,3}){3})?$/;

export async function GET(_request: Request, { params }: { params: Promise<{ ip: string }> }) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { ip } = await params;
  if (!ip || (!V4.test(ip) && !(ip.includes(':') && V6.test(ip)))) {
    return NextResponse.json({ error: 'Invalid IP' }, { status: 400 });
  }

  const payload = await cached(`host:${ip}`, 8_000, async () => {
    // One row per open port: the most recently observed finding is the
    // representative, and each carries how many times that port has been seen
    // across all scans plus its first/last-seen timestamps. This merges the
    // "80/tcp from scan A + 80/tcp from scan B" duplicates the raw table holds.
    const rowsRes = await db.execute(sql`
      SELECT id, "runId", ip, port, state, "latencyMs", banner, headers, service, product,
             "observedAt", "firstSeen", "lastSeen", "scanCount"
      FROM (
        SELECT
          id,
          run_id AS "runId",
          ip,
          port,
          state,
          latency_ms AS "latencyMs",
          banner,
          headers,
          service,
          product,
          observed_at AS "observedAt",
          min(observed_at) OVER (PARTITION BY port) AS "firstSeen",
          max(observed_at) OVER (PARTITION BY port) AS "lastSeen",
          count(*) OVER (PARTITION BY port)::int AS "scanCount",
          row_number() OVER (PARTITION BY port ORDER BY observed_at DESC) AS rn
        FROM port_findings
        WHERE ip = ${ip}
      ) t
      WHERE rn = 1
      ORDER BY port
      LIMIT 500
    `);
    const rows = rowsRes.rows as any[];

    const runsMap = new Map<number, typeof scanRuns.$inferSelect>();
    const runIds = [...new Set(rows.map((r) => r.runId).filter((v) => v != null) as number[])];
    if (runIds.length) {
      const runs = await db.select().from(scanRuns).where(inArray(scanRuns.id, runIds));
      for (const r of runs) runsMap.set(r.id, r);
    }

    // MaxMind enrichment: country + (city/lat/lng if the City edition is loaded)
    // + ASN/org. Each field is an independent longest-prefix lookup.
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

    return {
      ip,
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
      findings: rows.map((f) => ({
        id: Number(f.id),
        runId: f.runId != null ? Number(f.runId) : null,
        ip: String(f.ip),
        port: Number(f.port),
        state: f.state ?? 'open',
        latencyMs: f.latencyMs != null ? Number(f.latencyMs) : null,
        banner: f.banner ?? null,
        headers: f.headers ?? null,
        service: f.service ?? null,
        product: f.product ?? null,
        observedAt: f.observedAt,
        firstSeen: f.firstSeen,
        lastSeen: f.lastSeen,
        scanCount: Number(f.scanCount ?? 1),
        run: f.runId != null ? runsMap.get(Number(f.runId)) || null : null,
      })),
    };
  });

  // Private (per-user) browser cache so back/forward + quick re-visits are
  // instant; stale-while-revalidate keeps it feeling live without a spinner.
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'private, max-age=8, stale-while-revalidate=30' },
  });
}
