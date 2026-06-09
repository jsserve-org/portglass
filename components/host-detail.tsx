"use client";

import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowLeft,
  Globe,
  Radio,
  Server,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Activity,
  Shield,
  Clock,
} from "lucide-react";

const queryClient = new QueryClient();
import Link from "next/link";
import { useState } from "react";

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

function HostDetailInner({ ip }: { ip: string }) {
  const [expandedHeader, setExpandedHeader] = useState<number | null>(null);

  const data = useQuery({
    queryKey: ["host", ip],
    queryFn: async () => {
      const res = await fetch(`/api/host/${encodeURIComponent(ip)}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ ip: string; findings: Finding[] }>;
    },
    refetchInterval: 10000,
  });

  const findings = data.data?.findings ?? [];

  if (data.isLoading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <Activity size={32} />
          <p>Loading host details…</p>
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
          <Link href="/hosts" className="nav-link">Hosts</Link>
          <Link href="/scans" className="nav-link">Scans</Link>
        </div>
      </nav>

      <div className="scan-detail-page">
        <div className="scan-detail-header">
          <h1>
            <Globe size={18} />
            Host {ip}
          </h1>
          <div className="scan-meta-bar">
            <span><Radio size={12} /> {findings.length} open port{findings.length === 1 ? "" : "s"}</span>
            <span><Clock size={12} /> Last seen {findings[0] ? new Date(findings[0].observedAt).toLocaleString() : "—"}</span>
          </div>
        </div>

        <div className="scan-findings-section">
          <h3>
            <Server size={14} /> Port History
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
