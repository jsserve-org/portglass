"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useScansWs } from "@/lib/use-scans-ws";
import {
  Activity,
  MapPin,
  Clock,
  Radio,
  Zap,
  ChevronRight,
  Search,
  Trash2,
  Play,
  Plus,
  CheckCircle,
  XCircle,
  AlertCircle,
  Server,
  TerminalSquare,
} from "lucide-react";
import TopNav from "./top-nav";
import ManagePanel from "./manage-panel";
import ScanModal from "./scan-modal";
import Link from "next/link";

type ScanRun = {
  id: number;
  cidr: string;
  ports: string;
  startedAt: string;
  finishedAt: string | null;
  scannerPid: number | null;
  scannerVersion: string;
  notes: string | null;
  findingsCount: number;
  elapsedSec: number;
  etaSec: number;
  estimatedTotalSec: number;
  status: "active" | "completed" | "killed" | "failed" | "stalled" | "queued";
  progressPct: number;
  currentIp: string | null;
  totalTargets: number | null;
  attemptedTargets: number | null;
  label: string | null;
  cliDeviceId: string | null;
};

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtEta(sec: number): string {
  if (sec <= 0) return "finishing up";
  if (sec < 60) return `~${sec}s`;
  if (sec < 3600) return `~${Math.ceil(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.ceil((sec % 3600) / 60);
  return `~${h}h ${m}m`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "queued")
    return (
      <span className="scan-status-badge scan-status-queued">
        <Clock size={10} /> Queued
      </span>
    );
  if (status === "active")
    return (
      <span className="scan-status-badge scan-status-active">
        Active
      </span>
    );
  if (status === "completed")
    return (
      <span className="scan-status-badge scan-status-done">
        <CheckCircle size={10} /> Done
      </span>
    );
  if (status === "killed")
    return (
      <span className="scan-status-badge scan-status-killed">
        <XCircle size={10} /> Killed
      </span>
    );
  if (status === "stalled")
    return (
      <span className="scan-status-badge scan-status-failed">
        <AlertCircle size={10} /> Stalled
      </span>
    );
  return (
    <span className="scan-status-badge scan-status-failed">
      <AlertCircle size={10} /> Interrupted
    </span>
  );
}

// Status filter chips select the statuses to show. Any unknown status is
// bucketed as "failed" (rendered as Interrupted), matching StatusBadge.
const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "queued", label: "Queued" },
  { key: "completed", label: "Done" },
  { key: "stalled", label: "Stalled" },
  { key: "killed", label: "Killed" },
  { key: "failed", label: "Interrupted" },
];
const KNOWN_STATUSES = new Set(STATUS_FILTERS.map((s) => s.key));
function normStatus(s: string): string {
  return KNOWN_STATUSES.has(s) ? s : "failed";
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="progress-track" role="progressbar" aria-valuenow={Math.round(Math.min(100, Math.max(0, pct)))} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="progress-fill"
        style={{ transform: `scaleX(${Math.min(100, Math.max(0, pct)) / 100})` }}
      />
    </div>
  );
}

function ScansListInner() {
  const [q, setQ] = useState("");
  // An empty set means "all statuses". Selecting one or more chips narrows the
  // view; this is much less surprising than a chip labelled Active that hid
  // Active rows when clicked.
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [showScan, setShowScan] = useState(false);
  const live = useScansWs(["scans"]);

  const scans = useQuery({
    queryKey: ["scans"],
    queryFn: async () => {
      const res = await fetch("/api/runs", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<ScanRun[]>;
    },
    refetchInterval: live ? false : 5000,
  });

  const all = scans.data ?? [];

  // Memoized: typing in the filter box re-rendered this whole tree per
  // keystroke, re-running normStatus twice per row each time.
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of all) {
      const key = normStatus(s.status);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [all]);

  const rows = useMemo(() => all.filter((s) => {
    if (statusFilter.size > 0 && !statusFilter.has(normStatus(s.status))) return false;
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      s.cidr.toLowerCase().includes(needle) ||
      s.ports.toLowerCase().includes(needle) ||
      String(s.id).includes(needle) ||
      (s.label?.toLowerCase().includes(needle) ?? false)
    );
  }), [all, statusFilter, q]);

  const toggleStatus = (key: string) =>
    setStatusFilter((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const activeCount = rows.filter((s) => s.status === "active").length;

  return (
    <div className="app">
      <TopNav active="/scans" />

      <div className="scan-detail-page">
        <div className="scan-detail-header">
          <div className="scan-meta-row">
            <h1>
              <Zap size={18} />
              Scans
            </h1>
            {activeCount > 0 && (
              <span className="scan-active-badge">
                <span className="scan-pulse" />
                {activeCount} active
              </span>
            )}
            <button
              type="button"
              className="scan-btn"
              style={{ marginLeft: "auto" }}
              onClick={() => setShowScan(true)}
            >
              <Plus size={14} /> New Scan
            </button>
          </div>
          <div className="scan-meta-bar">
            <span style={{ color: live ? "var(--accent-cyan)" : "var(--text-dim)" }} title={live ? "Live via WebSocket" : "Polling (WebSocket unavailable)"}>
              <Radio size={12} /> {live ? "Live" : "Polling"}
            </span>
            <span><Radio size={12} /> {rows.length} total</span>
            <span><CheckCircle size={12} /> {rows.filter((s) => s.status === "completed").length} completed</span>
            <span><XCircle size={12} /> {rows.filter((s) => s.status === "killed").length} killed</span>
          </div>
        </div>

        <ManagePanel />

        <div className="scan-search-box" style={{ marginBottom: 14 }}>
          <Search size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter scans by label, CIDR, ports, or ID…"
            aria-label="Filter scans"
          />
        </div>

        <div className="scan-filter-bar">
          {STATUS_FILTERS.filter((f) => (statusCounts.get(f.key) ?? 0) > 0).map((f) => {
            const selected = statusFilter.has(f.key);
            return (
              <button
                key={f.key}
                type="button"
                className={`scan-filter-chip status-${f.key} ${selected ? "selected" : ""}`}
                aria-pressed={selected}
                onClick={() => toggleStatus(f.key)}
                title={selected ? `Remove ${f.label} from filter` : `Show ${f.label} scans`}
              >
                <span className="scan-filter-dot" />
                {f.label}
                <span className="scan-filter-count">{statusCounts.get(f.key)}</span>
              </button>
            );
          })}
          {statusFilter.size > 0 && (
            <button type="button" className="scan-filter-reset" onClick={() => setStatusFilter(new Set())}>
              Clear status filter
            </button>
          )}
        </div>

        <div className="scans-grid">
          {scans.isLoading ? (
            <>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="skeleton-card" style={{ gridColumn: "1 / -1" }} aria-hidden="true" />
              ))}
              <span className="sr-only">Loading scans…</span>
            </>
          ) : (
            <>
              {rows.map((run) => (
                <Link key={run.id} href={`/scan/${run.id}`} className="scan-card-link">
                  <div className={`scan-card ${run.status === "active" ? "scan-card-active" : ""}`}>
                    <div className="scan-card-top">
                      <div className="scan-card-id">#{run.id}</div>
                      <div className="flex items-center gap-1.5">
                        {run.cliDeviceId && <span className="scan-status-badge"><TerminalSquare size={10} /> CLI</span>}
                        <StatusBadge status={run.status} />
                      </div>
                    </div>
                    {run.label && <div className="scan-card-label">{run.label}</div>}
                    <div className="scan-card-cidr">
                      <MapPin size={12} />
                      {run.cidr}
                    </div>
                    <div className="scan-card-ports">
                      <Radio size={12} />
                      {run.ports.split(",").length} ports
                      <span className="spacer" />
                      <Clock size={12} />
                      {fmtDuration(run.elapsedSec)}
                    </div>
                    {run.status === "active" && <ProgressBar pct={run.progressPct} />}
                    {run.status === "active" && run.currentIp && (
                      <div className="scan-card-current" title="Currently scanning">
                        <Radio size={11} /> {run.currentIp}
                        {run.totalTargets ? (
                          <span className="spacer-dot">· {Math.min(99, Math.round(((run.attemptedTargets ?? 0) / run.totalTargets) * 100))}%</span>
                        ) : null}
                      </div>
                    )}
                    <div className="scan-card-footer">
                      <span><Server size={12} /> {run.findingsCount} open</span>
                      {run.status === "active" && run.etaSec > 0 && (
                        <span style={{ color: "var(--accent-cyan)", fontSize: 11, fontWeight: 600 }}>
                          <Zap size={12} /> {fmtEta(run.etaSec)}
                        </span>
                      )}
                      <span><ChevronRight size={14} /></span>
                    </div>
                  </div>
                </Link>
              ))}
              {!rows.length && (
                <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
                  <Search size={40} />
                  {all.length && (statusFilter.size || q.trim()) ? (
                    <>
                      <h3>No scans match your filters</h3>
                      <p>{statusFilter.size ? "The selected statuses have no matching scans. " : ""}Adjust the filters above to see more.</p>
                    </>
                  ) : (
                    <>
                      <h3>No scans found</h3>
                      <p>Start one with the New Scan button above.</p>
                    </>
                  )}
                </div>
              )}
              {scans.isError && (
                <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
                  <AlertCircle size={40} />
                  <h3>Couldn't load scans</h3>
                  <p>{(scans.error as Error)?.message || "Something went wrong."}</p>
                  <button type="button" className="scan-btn" onClick={() => scans.refetch()}>Retry</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showScan && (
        <ScanModal
          onClose={() => setShowScan(false)}
          onStarted={() => {
            // The list updates itself over the WebSocket/poll; just close.
            setShowScan(false);
          }}
        />
      )}
    </div>
  );
}

export default function ScansList() {
  return <ScansListInner />;
}
