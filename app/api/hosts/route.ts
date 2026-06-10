import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { portFindings } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';

export async function GET() {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const hostRows = await db.execute(sql`
    SELECT
      ip,
      COUNT(DISTINCT port)::int as port_count,
      MAX(observed_at) as last_seen,
      (SELECT g.country_iso FROM geo_blocks g WHERE g.network >>= port_findings.ip::inet ORDER BY masklen(g.network) DESC LIMIT 1) as country_iso,
      (SELECT g.country_name FROM geo_blocks g WHERE g.network >>= port_findings.ip::inet ORDER BY masklen(g.network) DESC LIMIT 1) as country_name,
      (SELECT a.asn FROM asn_blocks a WHERE a.network >>= port_findings.ip::inet ORDER BY masklen(a.network) DESC LIMIT 1) as asn,
      (SELECT a.org FROM asn_blocks a WHERE a.network >>= port_findings.ip::inet ORDER BY masklen(a.network) DESC LIMIT 1) as org
    FROM port_findings
    GROUP BY ip
    ORDER BY last_seen DESC
    LIMIT 500
  `);

  const ips = (hostRows.rows as any[]).map((r) => String(r.ip));

  if (ips.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch the latest finding per (ip, port) for these hosts.
  // Use a subquery for the IP list to avoid parameter-binding issues with arrays.
  const portRows = await db.execute(sql`
    SELECT DISTINCT ON (ip, port)
      ip,
      port,
      banner,
      headers,
      service
    FROM port_findings
    WHERE ip IN (SELECT ip FROM port_findings GROUP BY ip ORDER BY MAX(observed_at) DESC LIMIT 500)
    ORDER BY ip, port, observed_at DESC
  `);

  const portsByIp: Record<string, { port: number; banner: string | null; headers: string | null; service: string | null }[]> = {};
  for (const r of portRows.rows as any[]) {
    const ip = String(r.ip);
    if (!portsByIp[ip]) portsByIp[ip] = [];
    portsByIp[ip].push({
      port: Number(r.port),
      banner: r.banner ? String(r.banner) : null,
      headers: r.headers ? String(r.headers) : null,
      service: r.service ? String(r.service) : null,
    });
  }

  const result = (hostRows.rows as any[]).map((r) => ({
    ip: String(r.ip),
    port_count: Number(r.port_count),
    last_seen: String(r.last_seen),
    country_iso: r.country_iso ? String(r.country_iso) : null,
    country_name: r.country_name ? String(r.country_name) : null,
    asn: r.asn != null ? Number(r.asn) : null,
    org: r.org ? String(r.org) : null,
    ports: portsByIp[String(r.ip)] ?? [],
  }));

  return NextResponse.json(result);
}
