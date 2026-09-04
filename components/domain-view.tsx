"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Globe,
  Search,
  ExternalLink,
  Clock,
  FileCheck,
  ListFilter,
  TriangleAlert,
} from "lucide-react";
import TopNav from "./top-nav";
import CopyButton from "./copy-button";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { DomainResult, SubdomainEntry } from "@/lib/crtsh";

const PAGE_SIZE = 200;

type SortMode = "name" | "recent" | "certs";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

// `initialDomain` is set by the /domains/<domain> route so the searched
// domain lives in the URL path (shareable, back/forward works); the bare
// /domains page falls back to ?d=… for old links. The text input is just
// local editing state.
function DomainViewInner({ initialDomain }: { initialDomain?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const urlDomain = (
    initialDomain ||
    sp.get("d") ||
    ""
  ).toLowerCase();
  const [input, setInput] = useState(urlDomain);
  const [filter, setFilter] = useState("");
  // Debounced mirror of `filter`: CT result sets can be thousands of names,
  // and re-filtering + re-joining on every keystroke stalled the main thread.
  const [appliedFilter, setAppliedFilter] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => setInput(urlDomain), [urlDomain]);

  // 150ms debounce for the filter input.
  useEffect(() => {
    const t = setTimeout(() => setAppliedFilter(filter), 150);
    return () => clearTimeout(t);
  }, [filter]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const d = input.trim().toLowerCase().replace(/^\*\./, "");
    if (!d) return;
    setFilter("");
    setAppliedFilter("");
    setVisible(PAGE_SIZE);
    router.push(`/domains?d=${encodeURIComponent(d)}`);
  };

  const q = useQuery({
    queryKey: ["subdomains", urlDomain],
    enabled: !!urlDomain,
    queryFn: async (): Promise<DomainResult> => {
      const res = await fetch(`/api/domains/${encodeURIComponent(urlDomain)}/subdomains`, {
        credentials: "include",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Lookup failed (HTTP ${res.status})`);
      return body as DomainResult;
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const names = q.data?.names ?? [];
  const result = q.data;

  // Precompute epoch timestamps once per dataset instead of calling Date.parse
  // twice per comparison inside the sort comparator (O(n log n) parses).
  const tsByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of names) m.set(n.name, n.lastSeen ? Date.parse(n.lastSeen) : 0);
    return m;
  }, [names]);

  const shown = useMemo(() => {
    const f = appliedFilter.trim().toLowerCase();
    let list: SubdomainEntry[] = f
      ? names.filter((n) => n.name.includes(f))
      : names;
    if (sort === "recent") {
      list = [...list].sort(
        (a, b) => (tsByName.get(b.name) ?? 0) - (tsByName.get(a.name) ?? 0)
      );
    } else if (sort === "certs") {
      list = [...list].sort((a, b) => b.certs - a.certs);
    }
    return list;
  }, [names, appliedFilter, sort, tsByName]);

  const allNamesText = useMemo(() => shown.map((n) => n.name).join("\n"), [shown]);

  return (
    <div className="app">
      <TopNav active="/domains" />

      <div className="scan-detail-page">
        <div className="scan-detail-header">
          <h1>
            <Globe size={18} />
            Domains
          </h1>
          <div className="scan-meta-bar">
            <span>
              Subdomain discovery via public Certificate Transparency logs — no scans, nothing stored
            </span>
          </div>
        </div>

        {/* Search form */}
        <form onSubmit={submit} className="mb-4 flex max-w-2xl items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="example.com"
              spellCheck={false}
              autoCapitalize="none"
              autoComplete="off"
              aria-label="Domain to search"
              className="w-full rounded-sm border border-input bg-secondary py-2 pl-8 pr-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-beam focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || q.isFetching}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-2 font-mono text-xs font-bold text-primary-foreground transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {q.isFetching ? (
              <>
                <span className="spinner" style={{ width: 12, height: 12 }} /> Searching
              </>
            ) : (
              <>
                <Search size={13} /> Find subdomains
              </>
            )}
          </button>
        </form>

        {!urlDomain ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            Enter a domain to list every hostname issued in TLS certificates for it
            and its subdomains — the same trick crt.sh / crt.name use. Results come
            live from the public CT logs and are only kept briefly in memory.
          </p>
        ) : q.isLoading ? (
          <div className="loading-screen">
            <span className="spinner" />
            <p>Searching Certificate Transparency logs for {urlDomain}…</p>
          </div>
        ) : q.isError ? (
          <div className="rounded-md border border-destructive p-4 text-sm text-destructive">
            {(q.error as Error).message}
            <button
              type="button"
              onClick={() => q.refetch()}
              className="ml-3 rounded-sm border border-input bg-secondary px-2 py-1 font-mono text-[11px] text-foreground hover:border-beam hover:text-beam"
            >
              Retry
            </button>
          </div>
        ) : !result ? null : (
          <>
            {/* Result summary bar */}
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-muted-foreground [&_svg]:size-3 [&_svg]:text-[var(--text-dim)]">
              <span className="inline-flex items-center gap-1.5">
                <Globe /> {names.length.toLocaleString()} hostname{names.length === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileCheck /> {result.totalCerts.toLocaleString()} certificate{result.totalCerts === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock /> Queried {new Date(result.queriedAt).toLocaleTimeString()}
              </span>
              <a
                href={
                  result.source === "crt.sh"
                    ? `https://crt.sh/?q=${encodeURIComponent(result.domain)}`
                    : `https://sslmate.com/certspotter/search?q=${encodeURIComponent(result.domain)}`
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-beam hover:underline"
              >
                data via {result.source} <ExternalLink size={10} />
              </a>
            </div>

            {result.truncated && (
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-sm border border-amber px-2.5 py-1.5 font-mono text-[11px] text-amber">
                <TriangleAlert size={12} />
                Very large zone — list capped at {names.length.toLocaleString()} hostnames
              </div>
            )}

            {/* Filter + sort + copy-all toolbar */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative">
                <ListFilter size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setVisible(PAGE_SIZE);
                  }}
                  placeholder="Filter hostnames…"
                  spellCheck={false}
                  aria-label="Filter hostnames"
                  className="w-56 rounded-sm border border-input bg-secondary py-1.5 pl-7 pr-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-beam focus:outline-none"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                aria-label="Sort hostnames"
                className="rounded-sm border border-input bg-secondary px-2 py-1.5 font-mono text-xs text-foreground focus:border-beam focus:outline-none"
              >
                <option value="name">Sort: A → Z</option>
                <option value="recent">Sort: newest cert</option>
                <option value="certs">Sort: most certs</option>
              </select>
              <CopyButton
                text={allNamesText}
                label={`Copy ${shown.length.toLocaleString()} name${shown.length === 1 ? "" : "s"}`}
                title="Copy every filtered hostname, one per line"
              />
              {filter && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {shown.length.toLocaleString()} match{shown.length === 1 ? "" : "es"}
                </span>
              )}
            </div>

            {shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No certificates found for this domain in public CT logs.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2 xl:grid-cols-3">
                  {shown.slice(0, visible).map((n) => (
                    <div
                      key={n.name}
                      className="group flex items-baseline justify-between gap-3 border-b border-border py-2"
                    >
                      <a
                        href={`https://${n.name}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`Open https://${n.name}`}
                        className="min-w-0 truncate font-mono text-[13px] text-foreground hover:text-beam"
                      >
                        {n.name}
                      </a>
                      <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] text-muted-foreground">
                        <span title={`${n.certs} certificate${n.certs === 1 ? "" : "s"}${n.issuers ? ` · ${n.issuers} issuer${n.issuers === 1 ? "" : "s"}` : ""}`}>
                          {n.certs} cert{n.certs === 1 ? "" : "s"}
                        </span>
                        <span
                          className={cn("whitespace-nowrap")}
                          title={n.lastSeen ? `Latest certificate expires ${fmtDate(n.lastSeen)}` : undefined}
                        >
                          {fmtDate(n.lastSeen)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                {visible < shown.length && (
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-sm border border-input bg-secondary px-3 py-1.5 font-mono text-xs text-foreground transition-colors hover:border-beam hover:text-beam"
                  >
                    Show more ({(shown.length - visible).toLocaleString()} remaining)
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function DomainView() {
  return (
    <Suspense
      fallback={
        <div className="app">
          <div className="loading-screen">
            <span className="spinner" />
          </div>
        </div>
      }
    >
      <DomainViewInner />
    </Suspense>
  );
}
