import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shodanHostCache, shodanLookupLog } from '@/lib/schema';

const API_BASE = 'https://api.shodan.io';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PTR_NAMES = 5;

export type ShodanHostIntel = {
  source: 'Shodan';
  ip: string;
  countryCode: string | null;
  countryName: string | null;
  city: string | null;
  regionCode: string | null;
  asn: string | null;
  org: string | null;
  isp: string | null;
  os: string | null;
  ports: number[];
  hostnames: string[];
  domains: string[];
  tags: string[];
  lastUpdate: string | null;
  reverseDns: string[];
  forwardDns: Record<string, string[]>;
  fcrdns: boolean;
};

type Cached = { expiresAt: number; value: ShodanHostIntel };
const cache = new Map<string, Cached>();
const inFlight = new Map<string, Promise<ShodanHostIntel>>();

export class ShodanApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ShodanApiError';
  }
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))];
}

function numbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is number => Number.isInteger(item) && item >= 0 && item <= 65535))]
    .sort((a, b) => a - b);
}

async function request(path: string, params: Record<string, string>, apiKey: string): Promise<unknown> {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  if (!response.ok) {
    const detail = typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`;
    throw new ShodanApiError(detail, response.status);
  }
  return body;
}

async function loadHost(ip: string, apiKey: string): Promise<ShodanHostIntel> {
  // minify=true intentionally omits service banners. Portglass only needs
  // summary enrichment and must not become a redistributor of Shodan content.
  let host: Record<string, unknown> = {};
  try {
    host = await request(`/shodan/host/${encodeURIComponent(ip)}`, { minify: 'true' }, apiKey) as Record<string, unknown>;
  } catch (error) {
    // Shodan DNS can still know about an address that has no host banner
    // record, so a host 404 should not suppress the requested DNS enrichment.
    if (!(error instanceof ShodanApiError) || error.status !== 404) throw error;
  }
  const reverse = await request('/dns/reverse', { ips: ip }, apiKey) as Record<string, unknown>;
  const reverseDns = strings(reverse[ip]).slice(0, MAX_PTR_NAMES);

  const forwardDns: Record<string, string[]> = {};
  if (reverseDns.length) {
    const resolved = await request('/dns/resolve', { hostnames: reverseDns.join(',') }, apiKey) as Record<string, unknown>;
    for (const hostname of reverseDns) {
      const answer = resolved[hostname];
      forwardDns[hostname] = typeof answer === 'string' && answer.length ? [answer] : [];
    }
  }

  return {
    source: 'Shodan',
    ip,
    countryCode: typeof host.country_code === 'string' ? host.country_code : null,
    countryName: typeof host.country_name === 'string' ? host.country_name : null,
    city: typeof host.city === 'string' ? host.city : null,
    regionCode: typeof host.region_code === 'string' ? host.region_code : null,
    asn: typeof host.asn === 'string' ? host.asn : null,
    org: typeof host.org === 'string' ? host.org : null,
    isp: typeof host.isp === 'string' ? host.isp : null,
    os: typeof host.os === 'string' ? host.os : null,
    ports: numbers(host.ports),
    hostnames: strings(host.hostnames),
    domains: strings(host.domains),
    tags: strings(host.tags),
    lastUpdate: typeof host.last_update === 'string' ? host.last_update : null,
    reverseDns,
    forwardDns,
    fcrdns: Object.values(forwardDns).some((addresses) => addresses.includes(ip)),
  };
}

export function isShodanConfigured(): boolean {
  return Boolean(process.env.SHODAN_API_KEY?.trim());
}

export async function getShodanHostIntel(ip: string, options: { runId?: number } = {}): Promise<ShodanHostIntel> {
  const apiKey = process.env.SHODAN_API_KEY?.trim();
  if (!apiKey) throw new ShodanApiError('Shodan is not configured', 503);

  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [stored] = await db.select().from(shodanHostCache).where(eq(shodanHostCache.ip, ip)).limit(1);
  if (stored && stored.expiresAt.getTime() > Date.now()) {
    try {
      const value = JSON.parse(stored.summary) as ShodanHostIntel;
      cache.set(ip, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    } catch {
      // Corrupt/old cache shape: replace it with a fresh minified lookup.
    }
  }

  const pending = inFlight.get(ip);
  if (pending) return pending;

  const promise = loadHost(ip, apiKey)
    .then(async (value) => {
      cache.set(ip, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      await db.insert(shodanHostCache).values({
        ip,
        summary: JSON.stringify(value),
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + DB_CACHE_TTL_MS),
      }).onConflictDoUpdate({
        target: shodanHostCache.ip,
        set: { summary: JSON.stringify(value), fetchedAt: new Date(), expiresAt: new Date(Date.now() + DB_CACHE_TTL_MS) },
      });
      await db.insert(shodanLookupLog).values({ ip, runId: options.runId, status: 'fetched' });
      return value;
    })
    .catch(async (error) => {
      await db.insert(shodanLookupLog).values({
        ip,
        runId: options.runId,
        status: 'error',
        error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
      }).catch(() => {});
      throw error;
    })
    .finally(() => inFlight.delete(ip));
  inFlight.set(ip, promise);
  return promise;
}
