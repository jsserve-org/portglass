// Heuristic: does a host's reverse DNS look like an auto-generated dynamic /
// residential assignment rather than a deliberately-named static host?
//
// Key nuance: embedding the IP in the PTR (e.g. 203-0-113-19.example.net) is
// common for BOTH dynamic and static ranges, so it alone isn't enough. We weigh
// three signals per hostname:
//   1. dynamic keywords  (dsl/pppoe/cable/dhcp/pool/dynamic/…)  -> dynamic
//   2. static/infra keywords (static/dedicated/server/vps/mail/…) -> NOT dynamic
//   3. the IP embedded in the name, in any common encoding
// A dynamic keyword wins; an explicit static/infra keyword vetoes; otherwise an
// IP-embedded name with no static marker reads as a generic (likely dynamic)
// residential PTR.

// Segment-anchored so we match whole labels, not substrings (avoids "res" in
// "resource"). `\b`-style anchors are the separators . - _ or string ends.
const DYNAMIC_WORD =
  /(^|[.\-_])(dynamic|dyn|dynamicip|dynip|dip|dsl|adsl|vdsl|sdsl|pppoe|ppp|dialup|dial|cable|docsis|dhcp|pool|broadband|bband|gprs|umts|hsdpa|edge|lte|wimax|wireless|wlan|wifi|hotspot|cellular|mobile|res|residential|home|customer|cust|subscriber|client|user|abo|cpe|access|catv|kabel|telecom)([.\-_]|$)/i;

// Deliberately-assigned / infrastructure markers — these veto a "dynamic" call.
const STATIC_WORD =
  /(^|[.\-_])(static|dedicated|dedi|fixed|colo|colocation|vps|vserver|server|srv|dedibox|cloud|datacenter|\bdc\b|biz|business|corp|enterprise|hosting|hosted|mail|smtp|mx\d*|imap|pop|ns\d*|dns|www\d*|web|gw|gateway|vpn|lb|balancer|proxy|cdn|edge-?node)([.\-_]|$)/i;

export type DynamicVerdict = { isDynamic: boolean; confidence: 'high' | 'medium'; reason: string | null };

const NOT_DYNAMIC: DynamicVerdict = { isDynamic: false, confidence: 'high', reason: null };

// Does `host` contain this IP encoded in a common PTR form?
function embedsIp(host: string, ip: string): boolean {
  const octets = ip.split('.');
  if (octets.length !== 4) return false;
  const nums = octets.map((o) => parseInt(o, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;

  const forms = new Set<string>();
  const pad = octets.map((o) => o.padStart(3, '0'));
  for (const parts of [octets, [...octets].reverse(), pad, [...pad].reverse()]) {
    forms.add(parts.join('.'));
    forms.add(parts.join('-'));
  }
  // Hex encodings: full 8-hex-digit (e.g. 0a141e28) forward + reversed.
  const hex = nums.map((n) => n.toString(16).padStart(2, '0'));
  forms.add(hex.join(''));
  forms.add([...hex].reverse().join(''));

  const h = host.toLowerCase();
  for (const f of forms) if (f.length >= 4 && h.includes(f)) return true;
  return false;
}

export function detectDynamic(ip: string, hostnames: string[]): DynamicVerdict {
  if (!hostnames.length) return NOT_DYNAMIC;

  let dynamicHit: string | null = null;
  let staticHit: string | null = null;
  let embedHit: string | null = null;

  for (const h0 of hostnames) {
    const h = h0.toLowerCase();
    if (!dynamicHit && DYNAMIC_WORD.test(h)) dynamicHit = h0;
    if (!staticHit && STATIC_WORD.test(h)) staticHit = h0;
    if (!embedHit && embedsIp(h, ip)) embedHit = h0;
  }

  // An explicit dynamic keyword is the strongest signal.
  if (dynamicHit) {
    return { isDynamic: true, confidence: 'high', reason: `reverse DNS tagged dynamic/residential (${dynamicHit})` };
  }
  // A clear static/infra name vetoes (even if the IP is embedded).
  if (staticHit) return NOT_DYNAMIC;
  // Generic IP-in-name PTR with no static marker: typical residential default.
  if (embedHit) {
    return { isDynamic: true, confidence: 'medium', reason: `reverse DNS is a generic IP-embedded name (${embedHit})` };
  }
  return NOT_DYNAMIC;
}
