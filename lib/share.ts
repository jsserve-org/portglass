import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { db } from '@/lib/db';
import { portFindings, scanRuns, shares } from '@/lib/schema';
import { eq, desc, sql } from 'drizzle-orm';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

export type ShareKind = 'scan' | 'host';

/** Unguessable URL-safe token (~32 chars, 192 bits). */
export function newToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Hash a passphrase as `scrypt$<saltHex>$<hashHex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  // Async scrypt runs on the threadpool; the old sync version stalled the
  // event loop for ~50-100ms per call — on the public unlock route.
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Constant-time verify against a stored scrypt hash. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return true; // no password set
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = await scrypt(password, salt, expected.length);
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

export type ShareState = 'ok' | 'not_found' | 'revoked' | 'expired';

/** Serializable share metadata safe to hand to client components. */
export type ShareMeta = {
  kind: string;
  title: string | null;
  createdAt: string;
  expiresAt: string | null;
  needsPassword: boolean;
};

/**
 * Load a share by token for the public report page. Returns the full row plus
 * serializable meta so server components can render unlocked snapshots
 * directly instead of making the browser fetch after hydration.
 */
export async function loadShareMeta(
  token: string,
): Promise<{ status: Extract<ShareState, 'ok'>; share: typeof shares.$inferSelect; meta: ShareMeta } | { status: Exclude<ShareState, 'ok'> }> {
  const rows = await db.select().from(shares).where(eq(shares.token, token)).limit(1);
  const share = rows[0];
  if (!share) return { status: 'not_found' };
  if (share.revoked) return { status: 'revoked' };
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) return { status: 'expired' };
  return {
    status: 'ok',
    share,
    meta: {
      kind: share.kind,
      title: share.title,
      createdAt: new Date(share.createdAt).toISOString(),
      expiresAt: share.expiresAt ? new Date(share.expiresAt).toISOString() : null,
      needsPassword: !!share.passwordHash,
    },
  };
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
