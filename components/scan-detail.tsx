"use client";

import { useState } from "react";
import { useQuery, QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query";
import { useScanWs } from "@/lib/use-scan-ws";
import ShareButton from "./share-button";

const queryClient = makeQueryClient();
import {
  ArrowLeft,
  Globe,
  Radio,
  Server,
  Zap,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MapPin,
  Clock,
  } from "lucide-react";
import TopNav from "./top-nav";
import Link from "next/link";
import DeviceBadge, { DEVICE_COLORS } from "./device-badge";
import { deviceLabel, type DeviceType } from "@/lib/classify";

type Finding = {
  id: number;
  ip: string;
  port: number;
  latencyMs: number | null;
  banner: string | null;
  headers: string | null;
  service: string | null;
  product: string | null;
  observedAt: string;
};

type ScanRun = {
  id: number;
  cidr: string;
  label: string | null;
  ports: string;
  startedAt: string;
  finishedAt: string | null;
  scannerPid: number | null;
  notes: string | null;
  totalTargets: number | null;
  attemptedTargets: number | null;
  openCount: number | null;
  currentIp: string | null;
  progressAt: string | null;
  queued: boolean;
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
    A + iso.toUpperCase().charCodeAt(1) - 65,
  );
}

type Summary = {
  computed: {
    hosts: number;
    openPorts: number;
    portsScanned: number[];
    topServices: [string, number][];
    duration: number | null;
  };
  ai: string | null;
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

function ScanDetailInner({ runId }: { runId: string }) {
  const [expandedHeader, setExpandedHeader] = useState<number | null>(null);
  const [killing, setKilling] = useState(false);
  const [killError, setKillError] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);

  // Live scan detail (progress, current IP, findings) over WebSocket; fall back
  // to REST polling when the socket is down or proxy-blocked.
  const live = useScanWs(runId);
  const scan = useQuery({
    queryKey: ["scan", String(runId)],
    queryFn: async () => {
      const res = await fetch(`/api/scan/${runId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ run: ScanRun; geo?: Geo; findings: Finding[]; stats: any; deviceCounts?: { device_type: DeviceType; count: number }[] }>;
    },
    refetchInterval: live ? false : 5000,
  });

  const summary = useQuery({
    queryKey: ["scan-summary", runId],
    queryFn: async () => {
      const res = await fetch(`/api/scan/${runId}/summary`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<Summary>;
    },
  });

  const run = scan.data?.run;
  const geo = scan.data?.geo;
  const findings = scan.data?.findings ?? [];
  const stats = scan.data?.stats;
  const deviceCounts = scan.data?.deviceCounts ?? [];

  // A live scan heartbeats progress_at every few seconds. Treat an unfinished
  // run whose heartbeat has gone quiet as stalled (scanner died) rather than
  // "in progress" — this is what prevented the old "Elapsed 85h, still Live".
  const STALE_MS = 60 * 1000;
  const queued = !!run?.queued && !run?.finishedAt;
  const progressTs = run?.progressAt ? new Date(run.progressAt).getTime() : null;
  const stalled = !!run && !run.finishedAt && !queued && (!progressTs || Date.now() - progressTs > STALE_MS);
  const isActive = !!run && !run.finishedAt && !queued && !stalled;

  // Freeze elapsed at the last heartbeat once stalled, so a dead scan stops
  // ticking upward.
  const elapsedEnd = run?.finishedAt
    ? new Date(run.finishedAt).getTime()
    : stalled && progressTs
    ? progressTs
    : Date.now();
  const elapsedSec = run
    ? Math.max(0, Math.round((elapsedEnd - new Date(run.startedAt).getTime()) / 1000))
    : 0;
  const livePct =
    run?.totalTargets && run.totalTargets > 0
      ? Math.min(99, Math.round(((run.attemptedTargets ?? 0) / run.totalTargets) * 100))
      : null;
  const fmtElapsed = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  };
  const fmtEta = (sec: number) => {
    if (sec <= 0) return "finishing up";
    if (sec < 60) return `~${sec}s`;
    if (sec < 3600) return `~${Math.ceil(sec / 60)}m`;
    const h = Math.floor(sec / 3600);
    const m = Math.ceil((sec % 3600) / 60);
    return `~${h}h ${m}m`;
  };

  if (scan.isLoading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <span className="spinner" />
          <p>Loading scan details…</p>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="app">
        <div className="error-screen">
          <h2>Scan not found</h2>
          <Link href="/" className="auth-btn">
            <ArrowLeft size={14} /> Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const comp = summary.data?.computed;
  const ai = summary.data?.ai;

  const saveLabel = async () => {
    setSavingLabel(true);
    try {
      const res = await fetch(`/api/scan/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label: labelDraft.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      await scan.refetch();
      setEditingLabel(false);
    } catch {
      /* leave the editor open so the user can retry */
    } finally {
      setSavingLabel(false);
    }
  };

  const forceKillScan = async () => {
    if (!window.confirm("Force kill this port scan? Any partial findings already saved will remain.")) return;
    setKilling(true);
    setKillError(null);
    try {
      const res = await fetch(`/api/scan/${runId}/kill`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      await scan.refetch();
    } catch (err) {
      setKillError(err instanceof Error ? err.message : "Failed to force kill scan");
    } finally {
      setKilling(false);
    }
  };

  return (
    <div className="app">
      <TopNav />

      <div className="scan-detail-page">
        <div className="scan-detail-header">
          <div className="scan-meta-row">
            <h1>
              <MapPin size={18} />
              {run.label || `Scan ${run.cidr}`}
            </h1>
            {editingLabel ? (
              <span className="scan-label-edit">
                <input
                  className="scan-label-input"
                  value={labelDraft}
                  autoFocus
                  maxLength={80}
                  placeholder="Label / description"
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveLabel();
                    if (e.key === "Escape") setEditingLabel(false);
                  }}
                />
                <button className="scan-label-btn" onClick={saveLabel} disabled={savingLabel}>
                  {savingLabel ? "…" : "Save"}
                </button>
                <button className="scan-label-btn ghost" onClick={() => setEditingLabel(false)}>Cancel</button>
              </span>
            ) : (
              <button
                className="scan-label-btn ghost"
                onClick={() => { setLabelDraft(run.label || ""); setEditingLabel(true); }}
              >
                {run.label ? "Edit label" : "Add label"}
              </button>
            )}
            {isActive && (
              <span className="scan-active-badge">
                <span className="scan-pulse" />
                Active
              </span>
            )}
            {isActive && (
              <button className="danger-action-btn" onClick={forceKillScan} disabled={killing}>
                {killing ? "Killing…" : "Force kill port scanning"}
              </button>
            )}
            <ShareButton kind="scan" refId={String(run.id)} />
            {isActive && (
              <span
                className="scan-live-tag"
                style={{ color: live ? "var(--accent-cyan)" : "var(--text-dim)" }}
                title={live ? "Live via WebSocket" : "Polling (WebSocket unavailable)"}
              >
                <Radio size={12} /> {live ? "Live" : "Polling"}
              </span>
            )}
          </div>
          <div className="scan-meta-bar">
            <span><MapPin size={12} /> {run.cidr}</span>
            <span><Clock size={12} /> Started {new Date(run.startedAt).toLocaleString()}</span>
            {run.finishedAt && <span><Clock size={12} /> Finished {new Date(run.finishedAt).toLocaleString()}</span>}
            {comp?.duration && <span><Zap size={12} /> Duration {comp.duration}s</span>}
            <span><Server size={12} /> {run.ports.split(",").length} ports</span>
            {geo?.countryIso && (
              <span><Globe size={12} /> {flagEmoji(geo.countryIso)} {geo.countryName || geo.countryIso}</span>
            )}
            {geo?.asn && (
              <span title={geo.org || ""}><Server size={12} /> AS{geo.asn}{geo.org ? ` · ${geo.org}` : ""}</span>
            )}
            {run.scannerPid && <span>PID {run.scannerPid}</span>}
          </div>
          {killError && <div className="modal-error scan-kill-error">{killError}</div>}
        </div>

        {isActive && (
          <div className="scan-progress-box">
            <div className="scan-progress-header">
              <span className="scan-progress-title">
                Scanning in progress…
              </span>
              <span className="scan-progress-pct">{livePct != null ? `${livePct}%` : "Live"}</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: livePct != null ? `${livePct}%` : "100%" }}
              />
            </div>
            <div className="scan-progress-stats">
              <span><Clock size={12} /> Elapsed {fmtElapsed(elapsedSec)}</span>
              {run?.currentIp && (
                <span style={{ color: "var(--accent-cyan)" }}>
                  <Radio size={12} /> Scanning {run.currentIp}
                </span>
              )}
              {run?.totalTargets ? (
                <span><Server size={12} /> {(run.attemptedTargets ?? 0).toLocaleString()} / {run.totalTargets.toLocaleString()} probes</span>
              ) : null}
              <span><Radio size={12} /> {findings.length} open finding{findings.length === 1 ? "" : "s"} so far</span>
              {stats?.etaSec > 0 && (
                <span style={{ color: "var(--accent-cyan)" }}><Zap size={12} /> ETA {fmtEta(stats.etaSec)} remaining</span>
              )}
            </div>
          </div>
        )}

        {queued && (
          <div className="scan-progress-box scan-progress-queued">
            <div className="scan-progress-header">
              <span className="scan-progress-title">Queued</span>
              <span className="scan-progress-pct">Waiting</span>
            </div>
            <div className="scan-progress-stats">
              <span><Clock size={12} /> Waiting for a free scan slot</span>
              <span>It will start automatically when a running scan finishes.</span>
            </div>
          </div>
        )}

        {stalled && (
          <div className="scan-progress-box scan-progress-stalled">
            <div className="scan-progress-header">
              <span className="scan-progress-title">Scan stalled — no heartbeat</span>
              <span className="scan-progress-pct">Interrupted</span>
            </div>
            <div className="scan-progress-stats">
              <span><Clock size={12} /> Ran for {fmtElapsed(elapsedSec)} before going quiet</span>
              {run?.currentIp && <span><Radio size={12} /> Last IP {run.currentIp}</span>}
              <span><Radio size={12} /> {findings.length} finding{findings.length === 1 ? "" : "s"} saved</span>
              <span>The scanner process stopped (restart/crash). Re-run the scan to continue.</span>
            </div>
          </div>
        )}

        {comp && (
          <div className="scan-summary-cards">
            <div className="summary-card">
              <Globe size={18} />
              <div>
                <span className="value">{comp.hosts}</span>
                <span className="label">Hosts with open ports</span>
              </div>
            </div>
            <div className="summary-card">
              <Radio size={18} />
              <div>
                <span className="value">{comp.openPorts}</span>
                <span className="label">Open findings</span>
              </div>
            </div>
            <div className="summary-card wide">
              <Server size={18} />
              <div>
                <span className="label">Top services</span>
                <span className="value-small">{comp.topServices.slice(0, 5).map(([s, c]) => `${s} (${c})`).join(", ")}</span>
              </div>
            </div>
          </div>
        )}

        {deviceCounts.length > 0 && (() => {
          const total = deviceCounts.reduce((a, d) => a + d.count, 0);
          return (
            <div className="scan-devices">
              <h3><Server size={14} /> Device types in this scan</h3>
              <div className="scan-devices-bar">
                {deviceCounts.map((d) => (
                  <Link
                    key={d.device_type}
                    href={`/?device=${d.device_type}`}
                    className="scan-devices-seg"
                    style={{ flexGrow: d.count, background: DEVICE_COLORS[d.device_type] }}
                    title={`${deviceLabel(d.device_type)} — ${d.count}`}
                  />
                ))}
              </div>
              <div className="scan-devices-legend">
                {deviceCounts.map((d) => (
                  <Link key={d.device_type} href={`/?device=${d.device_type}`} className="scan-devices-item">
                    <DeviceBadge type={d.device_type} label={deviceLabel(d.device_type)} />
                    <span className="scan-devices-count">{d.count}</span>
                    <span className="scan-devices-pct">{Math.round((d.count / total) * 100)}%</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })()}

        {ai && (
          <div className="scan-ai-summary">
            <h3><Zap size={14} /> AI Summary</h3>
            <div className="ai-body" dangerouslySetInnerHTML={{ __html: ai.replace(/\n/g, "<br/>") }} />
          </div>
        )}

        {!ai && summary.isLoading && (
          <div className="scan-ai-summary loading">
            Generating summary…
          </div>
        )}

        <div className="scan-findings-section">
          <h3>
            <Radio size={14} /> Findings
            <span className="findings-count">{findings.length} results</span>
          </h3>

          <div className="findings-table-wrap">
            <table className="findings-table">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Port</th>
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
                      <Link href={`/host/${encodeURIComponent(f.ip)}`} className="ip-link">
                        <Globe size={12} />
                        {f.ip}
                      </Link>
                    </td>
                    <td>
                      <span className="port-badge">{f.port}</span>
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

export default function ScanDetail({ runId }: { runId: string }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ScanDetailInner runId={runId} />
    </QueryClientProvider>
  );
}
