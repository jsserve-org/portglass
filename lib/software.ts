import { sql, type SQL } from 'drizzle-orm';
import { sqlArray } from '@/lib/junk';

// Software / vendor fingerprints for the search "Software" facet. Matched
// (case-insensitively) against a finding's service / product / banner / headers.
// Purely for faceted counting + filtering — coarser than lib/tech.ts, but it
// runs in SQL so it can count and filter the whole dataset, not just one page.
export type Software = { key: string; label: string; like: string[] };

export const SOFTWARE: Software[] = [
  { key: 'nginx', label: 'nginx', like: ['%nginx%'] },
  { key: 'apache', label: 'Apache', like: ['%apache%'] },
  { key: 'iis', label: 'Microsoft IIS', like: ['%microsoft-iis%'] },
  { key: 'litespeed', label: 'LiteSpeed', like: ['%litespeed%'] },
  { key: 'openresty', label: 'OpenResty', like: ['%openresty%'] },
  { key: 'caddy', label: 'Caddy', like: ['%server: caddy%'] },
  { key: 'tomcat', label: 'Tomcat', like: ['%tomcat%', '%coyote%'] },
  { key: 'cloudflare', label: 'Cloudflare', like: ['%cloudflare%', '%cf-ray%'] },
  { key: 'cloudfront', label: 'CloudFront', like: ['%cloudfront%', '%x-amz-cf-id%'] },
  { key: 'akamai', label: 'Akamai', like: ['%akamai%'] },
  { key: 'fastly', label: 'Fastly', like: ['%fastly%'] },
  { key: 'vercel', label: 'Vercel', like: ['%vercel%'] },
  { key: 'php', label: 'PHP', like: ['%php/%', '%x-powered-by: php%'] },
  { key: 'aspnet', label: 'ASP.NET', like: ['%asp.net%', '%x-aspnet-version%'] },
  { key: 'express', label: 'Express', like: ['%x-powered-by: express%'] },
  { key: 'nextjs', label: 'Next.js', like: ['%next.js%', '%x-nextjs%'] },
  { key: 'wordpress', label: 'WordPress', like: ['%wordpress%', '%wp-content%'] },
  { key: 'drupal', label: 'Drupal', like: ['%drupal%'] },
  { key: 'openssh', label: 'OpenSSH', like: ['%openssh%'] },
  { key: 'exim', label: 'Exim', like: ['%exim%'] },
  { key: 'postfix', label: 'Postfix', like: ['%postfix%'] },
  { key: 'zimbra', label: 'Zimbra', like: ['%zimbra%'] },
  { key: 'exchange', label: 'MS Exchange', like: ['%microsoft exchange%', '%outlook web%'] },
  { key: 'dovecot', label: 'Dovecot', like: ['%dovecot%'] },
  { key: 'mysql', label: 'MySQL / MariaDB', like: ['%mysql%', '%mariadb%'] },
  { key: 'postgres', label: 'PostgreSQL', like: ['%postgres%'] },
  { key: 'redis', label: 'Redis', like: ['%redis%'] },
  { key: 'mongodb', label: 'MongoDB', like: ['%mongodb%'] },
  { key: 'elasticsearch', label: 'Elasticsearch', like: ['%elasticsearch%'] },
  { key: 'docker', label: 'Docker', like: ['%docker%'] },
  { key: 'kubernetes', label: 'Kubernetes', like: ['%kubernetes%', '%k8s%'] },
  { key: 'jenkins', label: 'Jenkins', like: ['%jenkins%'] },
  { key: 'grafana', label: 'Grafana', like: ['%grafana%'] },
];

const BY_KEY = new Map(SOFTWARE.map((s) => [s.key, s]));

export function softwareKeys(): string[] {
  return SOFTWARE.map((s) => s.key);
}

// Row-level text used for matching.
export const SOFTWARE_HAY = sql`concat_ws(' ', service, product, banner, headers)`;

// Predicate that is TRUE when a row matches the given software's patterns.
export function softwareMatchSql(key: string): SQL | null {
  const s = BY_KEY.get(key);
  if (!s) return null;
  return sql`${SOFTWARE_HAY} ILIKE ANY(${sqlArray(s.like)})`;
}
