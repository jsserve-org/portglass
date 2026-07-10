import { sql, type SQL } from 'drizzle-orm';

// "Junk" findings we never want in the dataset: Fortinet appliance noise
// (FortiGate firewalls / FortiOS SSL-VPN portals, etc.) and a few ports that
// only ever surface junk on the networks we scan. These are DELETED from the DB
// and blocked at scan time, so they neither accumulate nor show up in results.
//
// Keep this in sync with the Python copy in fast_scan.py (JUNK_SIGNATURES /
// JUNK_PORTS) — the scanner enforces the same rules at insert time.

// Case-insensitive substrings matched against banner / headers / service /
// product. Seeded with Fortinet fingerprints; add vendors/strings here.
export const JUNK_SIGNATURES = [
  'fortinet',
  'fortigate',
  'fortios',
  'forticlient',
  'fortimanager',
  'fortiweb',
  'fortiproxy',
  // FortiOS SSL-VPN web portal cookies (seen in captured HTTP headers).
  'svpncookie',
  'svpnnetworkcookie',
];

// Ports that only ever produce junk on these networks (e.g. Fortinet's 8008
// management/SSL-VPN portal). Every finding on one of these ports is dropped.
export const JUNK_PORTS = [8008];

const PATTERNS = JUNK_SIGNATURES.map((t) => `%${t}%`);

// True when a finding is junk (used for JS-side filtering, e.g. while streaming
// the full export).
export function isJunk(f: {
  port?: number | null;
  banner?: string | null;
  headers?: string | null;
  service?: string | null;
  product?: string | null;
}): boolean {
  if (f.port != null && JUNK_PORTS.includes(f.port)) return true;
  const hay = `${f.banner ?? ''}\n${f.headers ?? ''}\n${f.service ?? ''}\n${f.product ?? ''}`.toLowerCase();
  return JUNK_SIGNATURES.some((t) => hay.includes(t));
}

// SQL predicate that is TRUE when a port_findings row is junk. References the
// raw port/banner/headers/service/product columns.
export function junkMatchSql(): SQL {
  return sql`(
    port = ANY(${JUNK_PORTS})
    OR COALESCE(banner, '') ILIKE ANY(${PATTERNS})
    OR COALESCE(headers, '') ILIKE ANY(${PATTERNS})
    OR COALESCE(service, '') ILIKE ANY(${PATTERNS})
    OR COALESCE(product, '') ILIKE ANY(${PATTERNS})
  )`;
}
