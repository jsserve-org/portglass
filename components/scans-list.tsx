"use client";

import { useState } from "react";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowLeft,
  Activity,
  Shield,
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
import Link from "next/link";

const queryClient = new QueryClient();

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
  status: "active" | "completed" | "killed" | "failed";
  progressPct: number;
};

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
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
  return (
    <span className="scan-status-badge scan-status-failed">
      <AlertCircle size={10} /> Failed
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

  const scans = useQuery({
    queryKey: ["scans"],
    queryFn: async () => {
      const res = await fetch("/api/runs", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<ScanRun[]>;
    },
    refetchInterval: 3000,
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
      <nav className="topnav">
        <div className="nav-left">
          <Link href="/" className="logo">
            <Shield size={22} />
            <span>portglass</span>
          </Link>
          <Link href="/" className="nav-link">Search</Link>
          <Link href="/hosts" className="nav-link">Hosts</Link>
          <Link href="/scans" className="nav-link active">Scans</Link>
        </div>
      </nav>

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
                <div className="scan-card-footer">
                  <span><Server size={12} /> {run.findingsCount} open</span>
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
