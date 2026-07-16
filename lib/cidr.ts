// Lightweight CIDR validation shared by the scan endpoints. This is only a
// guard: fast_scan.py does the authoritative parse with Python's ipaddress.
// We accept both IPv4 and IPv6 so the app can scan v6 ranges too.

export type IpVersion = 4 | 6;

/**
 * Validate a CIDR string and return its IP version, or null if it's malformed.
 * IPv4 prefixes are restricted to /8–/32 (a scan wider than /8 is absurd on a
 * small host); IPv6 to /1–/128. The scanner further caps how many addresses a
 * single run will actually probe.
 */
export function cidrVersion(cidr: string): IpVersion | null {
  const slash = cidr.indexOf('/');
  if (slash < 0) return null;
  const ip = cidr.slice(0, slash);
  const prefixStr = cidr.slice(slash + 1);
  if (!ip || !prefixStr || !/^\d+$/.test(prefixStr)) return null;
  const p = parseInt(prefixStr, 10);

  if (ip.includes(':')) {
    // IPv6 — permissive structural check; real parse happens in the scanner.
    if (p < 1 || p > 128) return null;
    if (!/^[0-9a-fA-F:.]+$/.test(ip)) return null;
    // Require a plausible v6 shape: a '::' compression or enough groups.
    if (!ip.includes('::') && ip.split(':').length < 3) return null;
    return 6;
  }

  // IPv4
  if (p < 8 || p > 32) return null;
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = parseInt(part, 10);
    if (n < 0 || n > 255) return null;
  }
  return 4;
}

export function isValidCidr(cidr: string): boolean {
  return cidrVersion(cidr) !== null;
}
