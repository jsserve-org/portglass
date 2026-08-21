// Certificate Transparency subdomain discovery (the crt.sh / crt.name style
// "domain view"). Queries public CT-log search APIs for every certificate that
// mentions `domain` (or any of its subdomains) and aggregates down to one
// compact row per unique hostname. Primary source is crt.sh; if it is down or
// rate-limiting (it often is), Cert Spotter's free API is used as a fallback.
//
// Server-space budget: nothing is written to Postgres. Results live only in a
// tiny module-local LRU (MAX_DOMAINS entries) with a TTL, each entry capped at
// MAX_NAMES hostnames, and raw HTTP bodies are streamed with a hard byte cap
// so a pathological upstream answer can't balloon RSS. Concurrent identical
// lookups share one in-flight promise.

export type SubdomainEntry = {
  name: string;
  certs: number; // distinct certificates mentioning this name
  issuers: number; // distinct issuing CAs seen for this name (0 = unknown)
  firstSeen: string | null; // earliest not_before across those certs
  lastSeen: string | null; // latest not_after across those certs
};

export type DomainResult = {
  domain: string;
  source: "crt.sh" | "certspotter";
  queriedAt: string;
  totalCerts: number; // distinct certs matched before per-name aggregation
  truncated: boolean; // true when MAX_NAMES cut the list short
  names: SubdomainEntry[];
};

// Bounds that keep the server footprint small no matter what users search.
const MAX_NAMES = 4000; // per domain; huge zones (google.com) get truncated
const MAX_DOMAINS = 24; // LRU slots for cached domains
const TTL_MS = 6 * 60 * 60 * 1000; // CT logs move slowly; 6h is plenty fresh
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024; // hard cap on any upstream payload
const TIMEOUT_MS = 30_000;
const CRTSH_ATTEMPTS = 2;
const CERTSPOTTER_PAGES = 8; // ~800 issuances max on the fallback path
const DEADLINE_MS = 75_000; // whole-lookup budget, so requests never hang

type CrtShRow = {
  issuer_ca_id?: number | string;
  issuer_name?: string;
  common_name?: string | null;
  name_value?: string | null;
  id?: number | string;
  serial_number?: string | null;
  not_before?: string | null;
  not_after?: string | null;
};

type CertSpotterIssuance = {
  id?: string;
  dns_names?: string[];
  not_before?: string | null;
  not_after?: string | null;
};

const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Normalize user input to a bare lowercase hostname, or null if invalid. */
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  // Tolerate pasted URLs and wildcard/prefix forms.
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  d = d.replace(/^(\*\.)?/, "");
  d = d.split(/[/?#]/)[0].replace(/\.+$/, "");
  return HOSTNAME_RE.test(d) ? d : null;
}

// --- Tiny dedicated LRU + TTL store (mirrors lib/cache.ts semantics). ------

type StoreEntry = {
  value?: DomainResult;
  expires: number;
  inflight?: Promise<DomainResult>;
};

const store = new Map<string, StoreEntry>();

function storeGet(key: string): StoreEntry | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.value && hit.expires > Date.now()) {
    // Refresh recency so eviction drops the least recently used domain.
    store.delete(key);
    store.set(key, hit);
  }
  return hit;
}

function storeSet(key: string, value: DomainResult): void {
  store.delete(key);
  store.set(key, { value, expires: Date.now() + TTL_MS });
  while (store.size > MAX_DOMAINS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

// --- Fetch helpers ----------------------------------------------------------

async function readCapped(res: Response, cap: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const dec = new TextDecoder();
  let out = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > cap) {
      await reader.cancel().catch(() => {});
      throw new Error("upstream response exceeded size limit");
    }
    out += dec.decode(value, { stream: true });
  }
  return out + dec.decode();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstream returned HTTP ${res.status}`);
  const parsed = JSON.parse(await readCapped(res, MAX_RESPONSE_BYTES));
  return parsed;
}

/**
 * crt.sh treats `q` as a substring match over certificate identities, so a
 * bare domain query returns the apex plus every subdomain in one request.
 */
async function fetchCrtSh(domain: string): Promise<CrtShRow[]> {
  const rows = await fetchJson(
    `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`
  );
  if (!Array.isArray(rows)) throw new Error("unexpected crt.sh payload");
  return rows as CrtShRow[];
}

/** Cert Spotter fallback: paginated issuances, deduped by issuance id. */
async function fetchCertSpotter(domain: string, deadline: number): Promise<CrtShRow[]> {
  const rows: CrtShRow[] = [];
  let url: string | null =
    `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}` +
    `&include_subdomains=true&expand=dns_names`;
  for (let page = 0; page < CERTSPOTTER_PAGES && url; page++) {
    if (Date.now() > deadline) break; // return partial results rather than hang
    const res: Response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`certspotter returned HTTP ${res.status}`);
    const batch = JSON.parse(await readCapped(res, MAX_RESPONSE_BYTES));
    if (!Array.isArray(batch)) throw new Error("unexpected certspotter payload");
    for (const c of batch as CertSpotterIssuance[]) {
      rows.push({
        issuer_ca_id: "cs",
        issuer_name: "",
        common_name: null,
        name_value: (c.dns_names ?? []).join("\n"),
        serial_number: c.id ?? null,
        not_before: c.not_before ?? null,
        not_after: c.not_after ?? null,
      });
    }
    const link = res.headers.get("Link") || "";
    const next = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
    // Their Link header is a path-relative URL.
    url = next ? new URL(next, "https://api.certspotter.com").toString() : null;
  }
  return rows;
}

// --- Aggregation ------------------------------------------------------------

function aggregate(
  domain: string,
  source: DomainResult["source"],
  rows: CrtShRow[]
): DomainResult {
  type Acc = {
    certs: Set<string>;
    issuers: Set<string>;
    first: number | null;
    last: number | null;
  };
  const byName = new Map<string, Acc>();
  const allCerts = new Set<string>();
  let truncated = false;

  const touch = (
    name: string,
    certKey: string,
    issuer: string,
    nb: number | null,
    na: number | null
  ) => {
    let acc = byName.get(name);
    if (!acc) {
      if (byName.size >= MAX_NAMES) {
        truncated = true;
        return;
      }
      acc = { certs: new Set(), issuers: new Set(), first: null, last: null };
      byName.set(name, acc);
    }
    acc.certs.add(certKey);
    if (issuer) acc.issuers.add(issuer);
    if (nb !== null && (acc.first === null || nb < acc.first)) acc.first = nb;
    if (na !== null && (acc.last === null || na > acc.last)) acc.last = na;
  };

  for (const row of rows) {
    // Dedupe certs relogged into multiple CT logs / repeated pages.
    const certKey = `${row.issuer_ca_id ?? ""}:${row.serial_number ?? row.id ?? ""}`;
    allCerts.add(certKey);

    const issuer = String(row.issuer_name ?? "");
    const nb = row.not_before ? Date.parse(row.not_before) : NaN;
    const na = row.not_after ? Date.parse(row.not_after) : NaN;

    const rawNames = `${row.common_name ?? ""}\n${row.name_value ?? ""}`;
    for (const raw of rawNames.split("\n")) {
      let name = raw.trim().toLowerCase();
      if (!name) continue;
      // Fold wildcard identities onto their base hostname.
      name = name.replace(/^\*\./, "");
      if (name === domain || name.endsWith(`.${domain}`)) {
        touch(
          name,
          certKey,
          issuer,
          Number.isNaN(nb) ? null : nb,
          Number.isNaN(na) ? null : na
        );
      }
    }
  }

  const names: SubdomainEntry[] = [...byName.entries()]
    .map(([name, acc]) => ({
      name,
      certs: acc.certs.size,
      issuers: acc.issuers.size,
      firstSeen: acc.first !== null ? new Date(acc.first).toISOString() : null,
      lastSeen: acc.last !== null ? new Date(acc.last).toISOString() : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    domain,
    source,
    queriedAt: new Date().toISOString(),
    totalCerts: allCerts.size,
    truncated,
    names,
  };
}

/**
 * Look up every hostname observed for `domain` in public CT logs. Results are
 * cached in-memory only (bounded LRU, 6h TTL); nothing touches the database.
 */
export async function lookupSubdomains(domain: string): Promise<DomainResult> {
  const key = `ct:${domain}`;
  const hit = storeGet(key);
  if (hit?.value && hit.expires > Date.now()) return hit.value;
  if (hit?.inflight) return hit.inflight;

  const inflight = (async () => {
    const deadline = Date.now() + DEADLINE_MS;
    let lastErr: unknown;
    // Primary: crt.sh (richer data — issuers, full history).
    for (let attempt = 0; attempt < CRTSH_ATTEMPTS; attempt++) {
      try {
        const result = aggregate(domain, "crt.sh", await fetchCrtSh(domain));
        storeSet(key, result);
        return result;
      } catch (err) {
        lastErr = err;
        if (attempt < CRTSH_ATTEMPTS - 1 && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    }
    // Fallback: Cert Spotter's free API.
    if (Date.now() < deadline) {
      try {
        const result = aggregate(
          domain,
          "certspotter",
          await fetchCertSpotter(domain, deadline)
        );
        storeSet(key, result);
        return result;
      } catch (fallbackErr) {
        lastErr = fallbackErr;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("CT lookup failed");
  })();

  // Let concurrent callers share this attempt; on failure drop the placeholder.
  store.set(key, { expires: 0, inflight });
  inflight.catch(() => store.delete(key));
  return inflight;
}
