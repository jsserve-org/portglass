// Heuristic device-type detection for a host, from its open ports plus the
// banners / headers / service / product captured on them. Pure and
// dependency-free so it runs both server-side (findings API) and client-side
// (host detail). Scoring: each category accrues weight from matching port and
// text signals; the highest-scoring category wins (ties broken by the order
// below, most-specific first), falling back to "unknown" when nothing matches.
//
// Keep the category order + signals in sync with lib/classify-sql.ts, which
// mirrors this in SQL for dataset-wide filtering/counting.

export type DeviceType =
  | 'ipmi'
  | 'hypervisor'
  | 'camera'
  | 'printer'
  | 'voip'
  | 'game-server'
  | 'media-server'
  | 'nas'
  | 'database'
  | 'mail-server'
  | 'dns-server'
  | 'router'
  | 'firewall'
  | 'load-balancer'
  | 'iot'
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

// Order matters: earlier = more specific, wins ties. Role-based types (camera,
// database, mail, …) sit ahead of generic OS/ssh/web so a box is labelled by
// what it does, not just that it answers HTTP or RDP.
const CATEGORIES: Category[] = [
  {
    type: 'ipmi',
    label: 'Mgmt / IPMI',
    ports: { 623: 4, 16992: 3, 16993: 3 },
    text: /\bipmi\b|idrac|\bilo\b|integrated lights-?out|supermicro|\bbmc\b|intel\s?amt|redfish|\bcimc\b|\bdrac\b|baseboard management/i,
    textWeight: 3,
  },
  {
    type: 'hypervisor',
    label: 'Hypervisor',
    ports: { 8006: 4, 902: 3, 903: 2, 16509: 3 },
    text: /vmware|esxi|vsphere|proxmox|hyper-?v|xenserver|citrix hypervisor|\bkvm\b|libvirt|ovirt|nutanix|\bqemu\b/i,
    textWeight: 3,
  },
  {
    type: 'camera',
    label: 'IP Camera',
    ports: { 554: 3, 8554: 2, 37777: 3, 37778: 2, 34567: 2 },
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
    type: 'voip',
    label: 'VoIP / SIP',
    ports: { 5060: 3, 5061: 3, 2000: 1 },
    text: /sip\/2\.0|asterisk|freeswitch|\bvoip\b|call ?manager|\bsccp\b|\b3cx\b|freepbx|kamailio|opensips|polycom|yealink|grandstream/i,
    textWeight: 3,
  },
  {
    type: 'game-server',
    label: 'Game Server',
    ports: { 25565: 3, 19132: 2, 27015: 3, 7777: 1, 28015: 1 },
    text: /minecraft|counter-strike|source engine|\bvalve\b|garry'?s mod|\bgmod\b|rust server|\bark\b|terraria|factorio|fivem|\bsamp\b|teamspeak|steam/i,
    textWeight: 3,
  },
  {
    type: 'media-server',
    label: 'Media Server',
    ports: { 32400: 4, 8096: 3, 8920: 2 },
    text: /plex|jellyfin|\bemby\b|\bkodi\b|dlna|mediaserver|serviio|airplay|chromecast|\broku\b|\bsonos\b/i,
    textWeight: 3,
  },
  {
    type: 'nas',
    label: 'NAS / Storage',
    ports: { 5000: 2, 5001: 2, 548: 2, 2049: 2, 873: 2 },
    text: /synology|diskstation|\bqnap\b|truenas|freenas|netapp|openmediavault|\bnas\b|\bdsm\b|\bdrobo\b|wd my cloud|buffalo|unraid/i,
    textWeight: 3,
  },
  {
    type: 'database',
    label: 'Database',
    ports: { 3306: 3, 5432: 3, 1433: 3, 1521: 3, 27017: 3, 6379: 2, 9042: 2, 5984: 2, 11211: 2, 8123: 1 },
    text: /mysql|mariadb|postgresql|postgres|mongodb|\bredis\b|sql server|\boracle\b|cassandra|couchdb|memcached|clickhouse|elasticsearch|influxdb/i,
    textWeight: 3,
  },
  {
    type: 'mail-server',
    label: 'Mail Server',
    ports: { 25: 3, 465: 3, 587: 3, 110: 2, 143: 2, 993: 2, 995: 2 },
    text: /\bsmtp\b|esmtp|postfix|\bexim\b|sendmail|dovecot|\bimap\b|\bpop3\b|zimbra|exchange|courier|\bqmail\b|mail server/i,
    textWeight: 3,
  },
  {
    type: 'dns-server',
    label: 'DNS Server',
    ports: { 53: 4 },
    text: /\bbind\b|\bnamed\b|dnsmasq|powerdns|unbound|\bdns\b|domain name/i,
    textWeight: 2,
  },
  {
    type: 'router',
    label: 'Router / Gateway',
    ports: { 7547: 3, 1900: 1 },
    text: /openwrt|dd-wrt|\brouter\b|residential gateway|\bcpe\b|tp-?link|d-?link|netgear|asuswrt|\bzte\b|home gateway|dsl|broadband/i,
    textWeight: 3,
  },
  {
    type: 'firewall',
    label: 'Firewall',
    ports: { 500: 1, 4500: 1, 4443: 1 },
    text: /pfsense|sonicwall|cisco adaptive security|\basa\b|pan-os|palo alto|globalprotect|checkpoint|check point|watchguard|\bsophos\b|mikrotik|routeros|opnsense|\bfirewall\b|juniper|junos|zyxel|draytek/i,
    textWeight: 3,
  },
  {
    type: 'load-balancer',
    label: 'Load Balancer',
    ports: {},
    text: /haproxy|\bf5\b|big-?ip|nginx plus|traefik|\benvoy\b|netscaler|\bkemp\b|\ba10\b|load ?balancer|\bvarnish\b/i,
    textWeight: 3,
  },
  {
    type: 'iot',
    label: 'IoT / Smart Home',
    ports: { 1883: 3, 8883: 2, 5683: 2, 8123: 2 },
    text: /\bmqtt\b|home assistant|tasmota|shelly|sonoff|espressif|esp8266|esp32|\btuya\b|smartthings|\bhue\b|homekit|\bcoap\b|zigbee|z-wave/i,
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
  ipmi: 'Mgmt / IPMI',
  hypervisor: 'Hypervisor',
  camera: 'IP Camera',
  printer: 'Printer',
  voip: 'VoIP / SIP',
  'game-server': 'Game Server',
  'media-server': 'Media Server',
  nas: 'NAS / Storage',
  database: 'Database',
  'mail-server': 'Mail Server',
  'dns-server': 'DNS Server',
  router: 'Router / Gateway',
  firewall: 'Firewall',
  'load-balancer': 'Load Balancer',
  iot: 'IoT / Smart Home',
  'windows-server': 'Windows (RDP)',
  mobile: 'Mobile Device',
  'ssh-server': 'SSH Server',
  'web-server': 'Web Server',
  unknown: 'Unknown',
};

// The canonical display order (most-specific first), for filters and overviews.
export const DEVICE_ORDER: DeviceType[] = CATEGORIES.map((c) => c.type);

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
