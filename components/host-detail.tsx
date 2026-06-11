"use client";

import { useQuery, QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query";
import {
  Globe,
  Radio,
  Server,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Network,
  Cpu,
  Building2,
  Layers,
  Terminal,
} from "lucide-react";
import TopNav from "./top-nav";
import Link from "next/link";
import { useMemo, useState } from "react";
import WorldMap from "./world-map";
import { detectTech } from "@/lib/tech";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HostDns } from "@/app/api/host/[ip]/dns/route";

const queryClient = makeQueryClient();

type Finding = {
  id: number;
  runId: number | null;
  ip: string;
  port: number;
  latencyMs: number | null;
  banner: string | null;
  headers: string | null;
  service: string | null;
  product: string | null;
  observedAt: string;
  run: { id: number; cidr: string; startedAt: string } | null;
};

type Geo = {
  countryIso: string | null;
  countryName: string | null;
  asn: number | null;
  org: string | null;
};

function flagEmoji(iso: string | null | undefined): string {
  if (!iso || iso.length !== 2) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + iso.toUpperCase().charCodeAt(0) - 65,
    A + iso.toUpperCase().charCodeAt(1) - 65
  );
}

const HTTP_PORTS = new Set([
  80, 81, 88, 443, 3000, 4444, 4567, 5000, 5001, 5050, 5100, 5222, 5443,
  5555, 5601, 5800, 5900, 5984, 6000, 6080, 6443, 7000, 7001, 7070, 7474,
  7687, 8000, 8008, 8009, 8080, 8081, 8088, 8090, 8091, 8181, 8222, 8443,
  8501, 8834, 8880, 8883, 8888, 9000, 9001, 9042, 9043, 9090, 9091, 9092,
  9200, 9443, 9600, 9981, 10000, 10443, 12443, 27017, 28015, 50000,
]);

function isHttpPort(port: number) {
  return HTTP_PORTS.has(port);
}

function IntelRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3.5 border-b border-border px-3.5 py-2.5 last:border-b-0">
      <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] uppercase tracking-wide text-muted-foreground [&_svg]:size-3 [&_svg]:text-[var(--text-dim)]">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          "break-words text-right text-[13px] leading-snug text-foreground",
          mono && "font-mono text-beam"
        )}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

const TECH_ACCENT: Record<string, string> = {
  server: "border-l-2 border-l-signal",
  lang: "border-l-2 border-l-amber",
  framework: "border-l-2 border-l-beam",
  cdn: "border-l-2 border-l-[#c084fc]",
  os: "border-l-2 border-l-muted-foreground",
  service: "border-l-2 border-l-destructive",
  tls: "border-l-2 border-l-signal",
};

function HostDetailInner({ ip }: { ip: string }) {
  const [expandedHeader, setExpandedHeader] = useState<number | null>(null);

  const data = useQuery({
    queryKey: ["host", ip],
    queryFn: async () => {
      const res = await fetch(`/api/host/${encodeURIComponent(ip)}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ ip: string; geo?: Geo; findings: Finding[] }>;
    },
    refetchInterval: 10000,
  });

  const dnsq = useQuery({
    queryKey: ["dns", ip],
    queryFn: async () => {
      const res = await fetch(`/api/host/${encodeURIComponent(ip)}/dns`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<HostDns>;
    },
    staleTime: 60 * 60 * 1000,
  });

  const findings = data.data?.findings ?? [];
  const geo = data.data?.geo;
  const dnsData = dnsq.data;
  const reverseDns = dnsData?.reverse?.length ? dnsData.reverse.join(", ") : null;
  const forwardDns = dnsData ? [...new Set(Object.values(dnsData.forward).flat())] : [];

  const tech = useMemo(() => {
    const sources = findings.flatMap((f) => [f.headers, f.banner]);
    return detectTech(...sources);
  }, [findings]);

  const ports = useMemo(
    () => [...new Set(findings.map((f) => f.port))].sort((a, b) => a - b),
    [findings]
  );

  const location = geo?.countryName || geo?.countryIso || "Unknown";

  if (data.isLoading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <span className="spinner" />
          <p>Loading host details…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TopNav />

      <div className="scan-detail-page">
        {/* Header */}
        <div className="mb-5 flex flex-col gap-1.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[2.5px] text-signal">
            Host Intelligence
          </span>
          <h1 className="break-all font-mono text-[34px] font-semibold leading-none tracking-wide text-foreground">
            {ip}
          </h1>
          <div className="mt-1 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground [&_svg]:size-3 [&_svg]:text-[var(--text-dim)]">
            <span className="inline-flex items-center gap-1.5">
              <Radio /> {ports.length} open port{ports.length === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock /> Last seen {findings[0] ? new Date(findings[0].observedAt).toLocaleString() : "—"}
            </span>
            {geo?.countryIso && (
              <span className="inline-flex items-center gap-1.5">
                <Globe /> {flagEmoji(geo.countryIso)} {geo.countryName || geo.countryIso}
              </span>
            )}
          </div>
        </div>

        {/* Intel hero: map + panels */}
        <div className="mb-4 grid gap-3.5 lg:grid-cols-[1.55fr_1fr]">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>
                <MapPin /> Approximate Location
              </CardTitle>
              {geo?.countryIso && (
                <Badge variant="beam">
                  {flagEmoji(geo.countryIso)} {geo.countryIso}
                </Badge>
              )}
            </CardHeader>
            <WorldMap countryIso={geo?.countryIso ?? null} label={location} />
          </Card>

          <div className="flex flex-col gap-3.5">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Building2 /> Network
                </CardTitle>
              </CardHeader>
              <div>
                <IntelRow
                  icon={<Globe />}
                  label="Location"
                  value={geo?.countryIso ? `${flagEmoji(geo.countryIso)} ${location}` : location}
                />
                <IntelRow icon={<Network />} label="ASN" value={geo?.asn ? `AS${geo.asn}` : null} mono />
                <IntelRow icon={<Layers />} label="Org" value={geo?.org} />
                <IntelRow
                  icon={<Network />}
                  label="Reverse DNS"
                  value={dnsq.isLoading ? "resolving…" : reverseDns}
                  mono
                />
                <IntelRow
                  icon={<Globe />}
                  label="Forward DNS"
                  value={
                    forwardDns.length ? (
                      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {forwardDns.join(", ")}
                        {dnsData?.fcrdns && <Badge variant="default">FCrDNS ✓</Badge>}
                      </span>
                    ) : dnsq.isLoading ? (
                      "resolving…"
                    ) : null
                  }
                  mono
                />
                <IntelRow icon={<Server />} label="Open ports" value={ports.length} mono />
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <Cpu /> Technology
                </CardTitle>
                <Badge variant="slate">{tech.length}</Badge>
              </CardHeader>
              {tech.length ? (
                <CardContent className="flex flex-wrap gap-2">
                  {tech.map((t) => (
                    <span
                      key={t.name}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm border border-input bg-secondary px-2.5 py-1 font-mono text-[11px] font-medium text-foreground",
                        TECH_ACCENT[t.kind]
                      )}
                    >
                      {t.name}
                      {t.version ? (
                        <em className="text-[10px] not-italic text-muted-foreground">{t.version}</em>
                      ) : null}
                    </span>
                  ))}
                </CardContent>
              ) : (
                <CardContent className="text-xs text-[var(--text-dim)]">
                  No fingerprints from banners or headers.
                </CardContent>
              )}
            </Card>
          </div>
        </div>

        {/* Open ports strip */}
        <Card className="mb-6 flex flex-wrap items-center gap-3.5 p-4">
          <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-[1.4px] text-muted-foreground [&_svg]:size-3 [&_svg]:text-signal">
            <Server /> Open Ports
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ports.map((p) => {
              const linkable = isHttpPort(p);
              return (
                <a
                  key={p}
                  href={linkable ? `http${p === 443 || p === 8443 ? "s" : ""}://${ip}:${p}` : undefined}
                  target={linkable ? "_blank" : undefined}
                  rel="noreferrer"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-sm border border-input bg-secondary px-2.5 py-1 font-mono text-xs font-semibold text-foreground",
                    linkable && "cursor-pointer text-beam hover:border-beam"
                  )}
                >
                  {p}
                  {linkable && <ExternalLink size={10} className="opacity-60" />}
                </a>
              );
            })}
          </div>
        </Card>

        {/* Service detail table */}
        <div className="scan-findings-section">
          <h3>
            <Terminal size={14} /> Service Detail
            <span className="findings-count">
              {findings.length} record{findings.length === 1 ? "" : "s"}
            </span>
          </h3>

          <div className="findings-table-wrap">
            <table className="findings-table">
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Scan</th>
                  <th>Latency</th>
                  <th>Banner</th>
                  <th>Headers</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="port-badge">{f.port}</span>
                    </td>
                    <td>
                      {f.run ? (
                        <Link href={`/scan/${f.run.id}`} className="run-link">
                          {f.run.cidr}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{f.latencyMs ? `${f.latencyMs.toFixed(1)}ms` : "—"}</td>
                    <td className="cell-ellipsis" title={f.banner || ""}>
                      {f.banner || "—"}
                    </td>
                    <td>
                      {f.headers ? (
                        <button
                          className="header-toggle"
                          onClick={() => setExpandedHeader(expandedHeader === f.id ? null : f.id)}
                        >
                          {expandedHeader === f.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          View
                        </button>
                      ) : (
                        "—"
                      )}
                      {expandedHeader === f.id && f.headers && (
                        <pre className="headers-block">{f.headers}</pre>
                      )}
                    </td>
                    <td>
                      {isHttpPort(f.port) && (
                        <a
                          href={`http${f.port === 443 || f.port === 8443 ? "s" : ""}://${f.ip}:${f.port}`}
                          target="_blank"
                          rel="noreferrer"
                          className="open-link"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HostDetail({ ip }: { ip: string }) {
  return (
    <QueryClientProvider client={queryClient}>
      <HostDetailInner ip={ip} />
    </QueryClientProvider>
  );
}
