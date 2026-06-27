"use client";

import { useState } from "react";
import { useQuery, QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query";
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
  CheckCircle,
  XCircle,
  AlertCircle,
  Server,
} from "lucide-react";
import TopNav from "./top-nav";
import Link from "next/link";

const queryClient = makeQueryClient();

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
  status: "active" | "completed" | "killed" | "failed" | "stalled";
  progressPct: number;
  currentIp: string | null;
  totalTargets: number | null;
  attemptedTargets: number | null;
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

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="progress-track">
      <div
        className="progress-fill"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function ScansListInner() {
  const [q, setQ] = useState("");
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

  const rows = (scans.data ?? []).filter((s) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      s.cidr.toLowerCase().includes(needle) ||
      s.ports.toLowerCase().includes(needle) ||
      String(s.id).includes(needle)
    );
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

        <div className="scan-search-box" style={{ marginBottom: 20 }}>
          <Search size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter scans by CIDR, ports, or ID…"
          />
        </div>

        <div className="scans-grid">
          {rows.map((run) => (
            <Link key={run.id} href={`/scan/${run.id}`} className="scan-card-link">
              <div className={`scan-card ${run.status === "active" ? "scan-card-active" : ""}`}>
                <div className="scan-card-top">
                  <div className="scan-card-id">#{run.id}</div>
                  <StatusBadge status={run.status} />
                </div>
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
              <h3>No scans found</h3>
              <p>Start a new scan from the dashboard.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ScansList() {
  return (
    <QueryClientProvider client={queryClient}>
      <ScansListInner />
    </QueryClientProvider>
  );
}
