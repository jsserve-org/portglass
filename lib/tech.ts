// Lightweight technology fingerprinting from scanner banners + HTTP headers.
// No external wappalyzer-style DB — just the high-signal patterns we actually
// see in scan output, returned as a de-duplicated, ordered badge list.

export type Tech = { name: string; version?: string; kind: TechKind };
export type TechKind = 'server' | 'lang' | 'cdn' | 'framework' | 'os' | 'service' | 'tls';

type Rule = {
  kind: TechKind;
  // matched against the full text (headers + banner), case-insensitive
  re: RegExp;
  name: string;
  // optional capture group index for a version string
  version?: number;
};

const RULES: Rule[] = [
  { kind: 'server', re: /server:\s*nginx\/?([\d.]+)?/i, name: 'nginx', version: 1 },
  { kind: 'server', re: /server:\s*apache\/?([\d.]+)?/i, name: 'Apache', version: 1 },
  { kind: 'server', re: /server:\s*microsoft-iis\/?([\d.]+)?/i, name: 'IIS', version: 1 },
  { kind: 'server', re: /server:\s*litespeed/i, name: 'LiteSpeed' },
  { kind: 'server', re: /server:\s*caddy/i, name: 'Caddy' },
  { kind: 'server', re: /server:\s*openresty\/?([\d.]+)?/i, name: 'OpenResty', version: 1 },
  { kind: 'server', re: /server:\s*envoy/i, name: 'Envoy' },
  { kind: 'server', re: /server:\s*gunicorn\/?([\d.]+)?/i, name: 'Gunicorn', version: 1 },
  { kind: 'server', re: /server:\s*kestrel/i, name: 'Kestrel' },
  { kind: 'cdn', re: /(server:\s*cloudflare|cf-ray:)/i, name: 'Cloudflare' },
  { kind: 'cdn', re: /(x-amz-cf-id|server:\s*cloudfront)/i, name: 'CloudFront' },
  { kind: 'cdn', re: /x-akamai|akamaighost/i, name: 'Akamai' },
  { kind: 'cdn', re: /x-fastly|fastly/i, name: 'Fastly' },
  { kind: 'cdn', re: /x-vercel-id|server:\s*vercel/i, name: 'Vercel' },
  { kind: 'lang', re: /x-powered-by:\s*php\/?([\d.]+)?/i, name: 'PHP', version: 1 },
  { kind: 'lang', re: /x-powered-by:\s*asp\.net/i, name: 'ASP.NET' },
  { kind: 'lang', re: /x-powered-by:\s*express/i, name: 'Express' },
  { kind: 'lang', re: /x-aspnet-version:\s*([\d.]+)/i, name: 'ASP.NET', version: 1 },
  { kind: 'framework', re: /x-powered-by:\s*next\.js|x-nextjs/i, name: 'Next.js' },
  { kind: 'framework', re: /x-drupal/i, name: 'Drupal' },
  { kind: 'framework', re: /x-generator:\s*wordpress|wp-content/i, name: 'WordPress' },
  { kind: 'framework', re: /x-generator:\s*drupal/i, name: 'Drupal' },
  { kind: 'framework', re: /set-cookie:\s*laravel_session/i, name: 'Laravel' },
  { kind: 'framework', re: /set-cookie:\s*django|csrftoken/i, name: 'Django' },
  { kind: 'framework', re: /set-cookie:\s*jsessionid/i, name: 'Java/JSP' },
  { kind: 'service', re: /ssh-2\.0-openssh[_-]?([\d.p]+)?/i, name: 'OpenSSH', version: 1 },
  { kind: 'service', re: /ssh-2\.0-/i, name: 'SSH' },
  { kind: 'service', re: /220[\s-].*ftp/i, name: 'FTP' },
  { kind: 'service', re: /220[\s-].*(smtp|esmtp|postfix|exim|sendmail)/i, name: 'SMTP' },
  { kind: 'service', re: /(mysql|mariadb)/i, name: 'MySQL' },
  { kind: 'service', re: /postgresql|postgres/i, name: 'PostgreSQL' },
  { kind: 'service', re: /redis_version:?([\d.]+)?/i, name: 'Redis', version: 1 },
  { kind: 'service', re: /mongodb/i, name: 'MongoDB' },
  { kind: 'service', re: /elasticsearch/i, name: 'Elasticsearch' },
  { kind: 'service', re: /rabbitmq/i, name: 'RabbitMQ' },
  { kind: 'service', re: /docker/i, name: 'Docker' },
  { kind: 'service', re: /kubernetes|k8s/i, name: 'Kubernetes' },
  { kind: 'service', re: /grafana/i, name: 'Grafana' },
  { kind: 'service', re: /prometheus/i, name: 'Prometheus' },
  { kind: 'service', re: /jenkins/i, name: 'Jenkins' },
  { kind: 'os', re: /ubuntu/i, name: 'Ubuntu' },
  { kind: 'os', re: /debian/i, name: 'Debian' },
  { kind: 'os', re: /centos/i, name: 'CentOS' },
  { kind: 'os', re: /\(win(32|64|dows)\)/i, name: 'Windows' },
  { kind: 'os', re: /red ?hat/i, name: 'Red Hat' },
];

export function detectTech(...sources: (string | null | undefined)[]): Tech[] {
  const text = sources.filter(Boolean).join('\n');
  if (!text) return [];
  const out: Tech[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    const m = text.match(rule.re);
    if (!m) continue;
    if (seen.has(rule.name)) continue;
    seen.add(rule.name);
    const version = rule.version && m[rule.version] ? m[rule.version] : undefined;
    out.push({ name: rule.name, version, kind: rule.kind });
  }
  return out;
}
