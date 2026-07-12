// Heuristic: does a host's reverse DNS look like an auto-generated dynamic /
// residential assignment rather than a deliberately-named static host? Many
// ISPs encode the IP into the PTR (e.g. 203-0-113-19.dsl.example.net) and/or tag
// it dynamic/dsl/pppoe/etc. Used to flag likely-dynamic IPs on the host page.

// Strong "this is a dynamic/residential pool" keywords. Kept fairly specific so
// deliberately-named static hosts don't get flagged.
const DYNAMIC_WORDS =
  /(^|[.\-_])(dynamic|dyn|dynip|dhcp|dsl|adsl|vdsl|pppoe|ppp|broadband|dial-?up|dialup|cable|docsis|customer|cust|residential|res|pool|gprs|lte|cpe|dyip)([.\-_]|$)/i;

export type DynamicVerdict = { isDynamic: boolean; reason: string | null };

export function detectDynamic(ip: string, hostnames: string[]): DynamicVerdict {
  if (!hostnames.length) return { isDynamic: false, reason: null };
  const octets = ip.split('.');
  if (octets.length !== 4) return { isDynamic: false, reason: null };

  const dashed = octets.join('-');
  const dashedRev = [...octets].reverse().join('-');
  const dotted = octets.join('.');
  const dottedRev = [...octets].reverse().join('.');
  const padded = octets.map((o) => o.padStart(3, '0')).join('-');
  const paddedRev = [...octets].map((o) => o.padStart(3, '0')).reverse().join('-');

  for (const h0 of hostnames) {
    const h = h0.toLowerCase();
    // The IP embedded in the hostname (dotted, dashed, zero-padded, either
    // order) is the strongest sign of an auto-generated PTR.
    if ([dashed, dashedRev, dotted, dottedRev, padded, paddedRev].some((form) => h.includes(form))) {
      return { isDynamic: true, reason: `reverse DNS embeds the IP (${h0}) — looks auto-generated` };
    }
    if (DYNAMIC_WORDS.test(h)) {
      return { isDynamic: true, reason: `reverse DNS tagged dynamic/residential (${h0})` };
    }
  }
  return { isDynamic: false, reason: null };
}
