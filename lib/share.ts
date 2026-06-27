import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';
import { portFindings, scanRuns } from '@/lib/schema';
import { eq, desc, sql } from 'drizzle-orm';

export type ShareKind = 'scan' | 'host';

/** Unguessable URL-safe token (~32 chars, 192 bits). */
export function newToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Hash a passphrase as `scrypt$<saltHex>$<hashHex>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Constant-time verify against a stored scrypt hash. */
export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return true; // no password set
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function geoFor(ipExpr: any) {
  return sql`
    SELECT
      (SELECT country_iso FROM geo_blocks WHERE network >>= ${ipExpr}::inet ORDER BY masklen(network) DESC LIMIT 1) as country_iso,
      (SELECT country_name FROM geo_blocks WHERE network >>= ${ipExpr}::inet ORDER BY masklen(network) DESC LIMIT 1) as country_name,
      (SELECT asn FROM asn_blocks WHERE network >>= ${ipExpr}::inet ORDER BY masklen(network) DESC LIMIT 1) as asn,
      (SELECT org FROM asn_blocks WHERE network >>= ${ipExpr}::inet ORDER BY masklen(network) DESC LIMIT 1) as org
  `;
}

function normalizeGeo(row: any) {
  const g = row ?? {};
  return {
    countryIso: g.country_iso ? String(g.country_iso) : null,
    countryName: g.country_name ? String(g.country_name) : null,
    asn: g.asn != null ? Number(g.asn) : null,
    org: g.org ? String(g.org) : null,
  };
}

/**
 * Build the immutable JSON snapshot for a scan run. Mirrors /api/scan/[id] so
 * the shared report renders the same data, frozen at share time. Returns null
 * if the run doesn't exist.
 */
export async function buildScanSnapshot(runId: number) {
  const run = await db.select().from(scanRuns).where(eq(scanRuns.id, runId)).limit(1);
  if (!run.length) return null;

  const findings = await db
    .select()
    .from(portFindings)
    .where(eq(portFindings.runId, runId))
    .orderBy(desc(portFindings.observedAt))
    .limit(500);

  const lookupIp = findings[0]?.ip ?? run[0].cidr.split('/')[0];
  let geo = normalizeGeo(null);
  try {
    const rows = await db.execute(geoFor(lookupIp));
    geo = normalizeGeo(rows.rows[0]);
  } catch {
    /* geo tables may be empty */
  }

  const hosts = new Set(findings.map((f) => f.ip)).size;
  return {
    kind: 'scan' as const,
    run: run[0],
    geo,
    findings,
    stats: { totalFindings: findings.length, hosts },
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Build the immutable JSON snapshot for a single host. Mirrors /api/host/[ip].
 * Returns null if the host has no findings.
 */
export async function buildHostSnapshot(ip: string) {
  const findings = await db
    .select()
    .from(portFindings)
    .where(eq(portFindings.ip, ip))
    .orderBy(desc(portFindings.observedAt))
    .limit(500);
  if (!findings.length) return null;

  let geo = normalizeGeo(null);
  try {
    const rows = await db.execute(geoFor(ip));
    geo = normalizeGeo(rows.rows[0]);
  } catch {
    /* geo tables may be empty */
  }

  return {
    kind: 'host' as const,
    ip,
    geo,
    findings,
    capturedAt: new Date().toISOString(),
  };
}
