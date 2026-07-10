import { sql, type SQL } from 'drizzle-orm';

// Fingerprints for Fortinet gear: FortiGate firewalls, FortiOS SSL-VPN portals,
// FortiManager/FortiWeb/FortiProxy, etc. Several scanned networks are saturated
// with these appliances, so we let results be filtered to hide them. Matched
// case-insensitively against a finding's banner / headers / service / product.
export const FORTINET_TERMS = [
  'fortinet',
  'fortigate',
  'fortios',
  'forticlient',
  'fortimanager',
  'fortiweb',
  'fortiadc',
  'fortiproxy',
  'fortimail',
  'fortiap',
  // FortiOS SSL-VPN web portal cookies (show up in captured HTTP headers).
  'svpncookie',
  'svpnnetworkcookie',
];

const PATTERNS = FORTINET_TERMS.map((t) => `%${t}%`);

// True when a finding looks like a Fortinet device (used for JS-side filtering,
// e.g. while streaming the full export).
export function isFortinet(f: {
  banner?: string | null;
  headers?: string | null;
  service?: string | null;
  product?: string | null;
}): boolean {
  const hay = `${f.banner ?? ''}\n${f.headers ?? ''}\n${f.service ?? ''}\n${f.product ?? ''}`.toLowerCase();
  return FORTINET_TERMS.some((t) => hay.includes(t));
}

// SQL predicate that is TRUE when a port_findings row is a Fortinet device.
// References the raw banner/headers/service/product columns.
export function fortinetMatchSql(): SQL {
  return sql`(
    COALESCE(banner, '') ILIKE ANY(${PATTERNS})
    OR COALESCE(headers, '') ILIKE ANY(${PATTERNS})
    OR COALESCE(service, '') ILIKE ANY(${PATTERNS})
    OR COALESCE(product, '') ILIKE ANY(${PATTERNS})
  )`;
}
