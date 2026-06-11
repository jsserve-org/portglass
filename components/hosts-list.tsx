"use client";

import { useQuery, QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query";
import {
  ArrowLeft,
  Globe,
  Radio,
  Server,
  Clock,
  Shield,
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const queryClient = makeQueryClient();

type HostRow = {
  ip: string;
  port_count: number;
  last_seen: string;
  country_iso: string | null;
  country_name: string | null;
  asn: number | null;
  org: string | null;
  ports: { port: number; banner: string | null; headers: string | null; service: string | null }[];
};

function flagEmoji(iso: string | null): string {
  if (!iso || iso.length !== 2) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + iso.toUpperCase().charCodeAt(0) - 65,
    A + iso.toUpperCase().charCodeAt(1) - 65,
  );
}

const HTTP_PORTS = new Set([
  80, 81, 88, 443, 3000, 4444, 4567, 5000, 5001, 5050, 5100, 5222, 5443,
  5555, 5601, 5800, 5900, 5984, 6000, 6080, 6443, 7000, 7001, 7070, 7474,
  7687, 8000, 8008, 8009, 8080, 8081, 8088, 8090, 8091, 8181, 8222, 8443,
  8501, 8834, 8880, 8883, 8888, 9000, 9001, 9042, 9043, 9090, 9091, 9092,
  9200, 9443, 9600, 9981, 10000, 10443, 12443, 15672, 27017, 28015, 50000,
]);

function isHttpPort(port: number) {
  return HTTP_PORTS.has(port);
}

function HostsListInner() {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const data = useQuery({
    queryKey: ["hosts"],
    queryFn: async () => {
      const res = await fetch("/api/hosts", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<HostRow[]>;
    },
    refetchInterval: 10000,
  });

  const hosts = (data.data ?? []).filter((h) =>
    h.ip.includes(q.trim()) || h.ports.some((p) => String(p.port).includes(q.trim()))
  );

  if (data.isLoading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <span className="spinner" />
          <p>Loading hosts…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="topnav">
        <div className="nav-left">
          <Link href="/" className="logo">
            <Shield size={22} />
            <span>portglass</span>
          </Link>
          <Link href="/" className="nav-link">
            <ArrowLeft size={14} /> Dashboard
          </Link>
          <Link href="/hosts" className="nav-link active">Hosts</Link>
          <Link href="/scans" className="nav-link">Scans</Link>
        </div>
      </nav>

      <div className="scan-detail-page">
        <div className="scan-detail-header">
          <h1>
            <Globe size={18} />
            All Hosts
          </h1>
          <div className="scan-meta-bar">
            <span><Radio size={12} /> {hosts.length} unique hosts</span>
          </div>
        </div>

        <div className="search-box" style={{ marginBottom: 20 }}>
          <Search size={18} className="search-icon" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by IP or port…"
          />
        </div>

        <div className="scan-findings-section">
          <div className="findings-table-wrap">
            <table className="findings-table table-hosts">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Location</th>
                  <th>ASN</th>
                  <th>Open Ports</th>
                  <th>Last Seen</th>
                  <th>Services</th>
                  <th>Expand</th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((h) => (
                  <>
                    <tr key={h.ip}>
                      <td>
                        <Link href={`/host/${encodeURIComponent(h.ip)}`} className="ip-link">
                          <Globe size={12} />
                          {h.ip}
                        </Link>
                      </td>
                      <td className="cell-ellipsis" title={h.country_name || ""}>
                        {h.country_iso ? `${flagEmoji(h.country_iso)} ${h.country_iso}` : "—"}
                      </td>
                      <td className="cell-ellipsis" title={h.org || ""}>
                        {h.asn ? `AS${h.asn}${h.org ? ` · ${h.org}` : ""}` : "—"}
                      </td>
                      <td>
                        <span className="port-badge">{h.port_count}</span>
                      </td>
                      <td>{new Date(h.last_seen).toLocaleString()}</td>
                      <td className="cell-ellipsis">
                        {h.ports?.map((p) => p.service || p.banner?.split(/[\s\/]/)[0] || String(p.port)).slice(0, 4).join(", ")}
                        {(h.ports?.length || 0) > 4 ? " …" : ""}
                      </td>
                      <td>
                        <button
                          className="header-toggle"
                          onClick={() => setExpanded(expanded === h.ip ? null : h.ip)}
                        >
                          {expanded === h.ip ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                    </tr>
                    {expanded === h.ip && (
                      <tr className="expanded-row">
                        <td colSpan={7}>
                          <div className="host-ports-grid">
                            {h.ports?.map((p) => (
                              <div key={p.port} className="host-port-chip">
                                <div className="host-port-top">
                                  <span className="port-badge">{p.port}</span>
                                  {isHttpPort(p.port) && (
                                    <a
                                      href={`http${p.port === 443 || p.port === 8443 ? "s" : ""}://${h.ip}:${p.port}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="open-link"
                                    >
                                      <ExternalLink size={12} />
                                    </a>
                                  )}
                                </div>
                                {p.banner && (
                                  <span className="host-port-banner" title={p.banner}>
                                    {p.banner}
                                  </span>
                                )}
                                {p.headers && (
                                  <pre className="host-port-headers">{p.headers}</pre>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HostsList() {
  return (
    <QueryClientProvider client={queryClient}>
      <HostsListInner />
    </QueryClientProvider>
  );
}
