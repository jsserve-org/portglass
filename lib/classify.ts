// Heuristic device-type detection for a host, from its open ports plus the
// banners / headers / service / product captured on them. Pure and
// dependency-free so it runs both server-side (findings API) and client-side
// (host detail). Scoring: each category accrues weight from matching port and
// text signals; the highest-scoring category wins (ties broken by the order
// below, most-specific first), falling back to "unknown" when nothing matches.

export type DeviceType =
  | 'camera'
  | 'printer'
  | 'firewall'
  | 'windows-server'
  | 'mobile'
  | 'ssh-server'
  | 'web-server'
  | 'unknown';

export type Classification = {
  type: DeviceType;
  label: string;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  // Other categories that also matched, strongest first (e.g. a camera that
  // also exposes a web UI).
  also: DeviceType[];
};

type FindingLike = {
  port?: number | null;
  service?: string | null;
  product?: string | null;
  banner?: string | null;
  headers?: string | null;
};

type Category = {
  type: Exclude<DeviceType, 'unknown'>;
  label: string;
  ports?: Record<number, number>; // port -> weight
  text?: RegExp; // matched against combined lowercased text
  textWeight?: number;
};

// Order matters: earlier = more specific, wins ties. Generic web/ssh servers
// sit last so a camera/printer/firewall that also serves HTTP is labelled by
// what it actually is.
const CATEGORIES: Category[] = [
  {
    type: 'camera',
    label: 'IP Camera',
    ports: { 554: 3, 8554: 2, 37777: 3, 37778: 2, 34567: 2, 8000: 1, 88: 1 },
    text: /rtsp|hikvision|dahua|\baxis\b|onvif|ip ?camera|ipcam|webcam|netcam|network camera|goahead|dvrdvs|\bnvr\b|\bdvr\b|vivotek|foscam|reolink|uniview/i,
    textWeight: 3,
  },
  {
    type: 'printer',
    label: 'Printer',
    ports: { 9100: 3, 9101: 2, 9102: 2, 515: 2, 631: 3 },
    text: /jetdirect|internet printing|ipp\b|\bprinter\b|laserjet|officejet|deskjet|\bpcl\b|postscript|brother|kyocera|lexmark|\bricoh\b|xerox|\bcanon\b|\bepson\b|cups\/|sharp mx/i,
    textWeight: 3,
  },
  {
    type: 'firewall',
    label: 'Firewall / Gateway',
    ports: { 500: 1, 4500: 1, 4443: 1 },
    text: /pfsense|sonicwall|cisco adaptive security|\basa\b|pan-os|palo alto|globalprotect|checkpoint|check point|watchguard|\bsophos\b|mikrotik|routeros|opnsense|\bfirewall\b|juniper|junos|zyxel|draytek/i,
    textWeight: 3,
  },
  {
    type: 'windows-server',
    label: 'Windows (RDP)',
    ports: { 3389: 4, 445: 1, 139: 1, 135: 1, 5985: 1, 5986: 1 },
    text: /ms-wbt|remote desktop|terminal serv|microsoft-iis|windows server|\bwin(?:32|64|dows)\b|\brdp\b/i,
    textWeight: 2,
  },
  {
    type: 'mobile',
    label: 'Mobile Device',
    ports: { 62078: 4, 5555: 3, 5228: 1 },
    text: /iphone|\bipad\b|lockdownd|\bandroid\b|\badb\b|dalvik/i,
    textWeight: 3,
  },
  {
    type: 'ssh-server',
    label: 'SSH Server',
    ports: { 22: 3, 2222: 1 },
    text: /ssh-2\.0|openssh|dropbear|libssh/i,
    textWeight: 2,
  },
  {
    type: 'web-server',
    label: 'Web Server',
    ports: { 80: 1, 443: 1, 8080: 1, 8443: 1, 8000: 1, 8888: 1, 3000: 1 },
    text: /server:\s*(?:nginx|apache|iis|caddy|litespeed|openresty|lighttpd|tomcat|jetty)|http\/1\.|http\/2|<html|<!doctype html/i,
    textWeight: 2,
  },
];

const LABELS: Record<DeviceType, string> = {
  camera: 'IP Camera',
  printer: 'Printer',
  firewall: 'Firewall / Gateway',
  'windows-server': 'Windows (RDP)',
  mobile: 'Mobile Device',
  'ssh-server': 'SSH Server',
  'web-server': 'Web Server',
  unknown: 'Unknown',
};

export function deviceLabel(type: DeviceType): string {
  return LABELS[type];
}

export function classifyDevice(findings: FindingLike[]): Classification {
  const ports = new Set<number>();
  const parts: string[] = [];
  for (const f of findings) {
    if (f.port != null) ports.add(f.port);
    if (f.service) parts.push(f.service);
    if (f.product) parts.push(f.product);
    if (f.banner) parts.push(f.banner);
    if (f.headers) parts.push(f.headers);
  }
  const text = parts.join('\n').toLowerCase();

  const scored = CATEGORIES.map((cat) => {
    let portScore = 0;
    if (cat.ports) {
      for (const p of ports) portScore += cat.ports[p] ?? 0;
    }
    // Cap the port contribution so a host with many web ports can't runaway.
    portScore = Math.min(portScore, 4);
    const textScore = cat.text && cat.text.test(text) ? (cat.textWeight ?? 1) : 0;
    return { type: cat.type, score: portScore + textScore };
  }).filter((s) => s.score > 0);

  // Stable sort by score desc; CATEGORIES order (specificity) breaks ties since
  // Array.map preserved it and JS sort is stable.
  scored.sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { type: 'unknown', label: LABELS.unknown, confidence: 'low', score: 0, also: [] };
  }

  const top = scored[0];
  const confidence: Classification['confidence'] =
    top.score >= 4 ? 'high' : top.score >= 2 ? 'medium' : 'low';

  return {
    type: top.type,
    label: LABELS[top.type],
    confidence,
    score: top.score,
    also: scored.slice(1).map((s) => s.type),
  };
}
