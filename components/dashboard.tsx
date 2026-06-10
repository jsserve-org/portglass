"use client";

import React from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Globe,
  MapPin,
  Monitor,
  Radio,
  Search,
  Server,
  Shield,
  Wifi,
  Zap,
  Trophy,
} from 'lucide-react';
import HostCard from './host-card';
import AuthNav from './auth-nav';
import ScanModal from './scan-modal';
import { Plus } from 'lucide-react';
import Link from 'next/link';

type Finding = {
  id: number;
  runId: number | null;
  ip: string;
  port: number;
  state: string;
  latencyMs: number | null;
  banner: string | null;
  service: string | null;
  product: string | null;
  observedAt: string;
  countryIso?: string | null;
  countryName?: string | null;
  asn?: number | null;
  org?: string | null;
};

type Stats = {
  findings: number;
  hosts: number;
  ports: number;
  runs: number;
  topPorts: { port: number; count: number }[];
};

type ScanRun = {
  id: number;
  cidr: string;
  ports: string;
  startedAt: string;
  finishedAt: string | null;
};

type TopHost = {
  ip: string;
  openPorts: number;
  avgLatencyMs: number;
  bestLatencyMs: number;
  lastSeen: string;
  ports: number[];
};

const api = async <T,>(path: string): Promise<T> => {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

function StatChip({ label, value, icon }: { label: string; value?: number; icon: React.ReactNode }) {
  return (
    <div className="stat-chip">
      {icon}
      <div>
        <span className="value">{value?.toLocaleString() ?? '—'}</span>
        <span className="label">{label}</span>
      </div>
    </div>
  );
}

function StatusPill() {
  return (
    <span className="status-pill">
      <span className="dot" />
      ONLINE
    </span>
  );
}

function DashboardInner() {
  const [q, setQ] = React.useState('');
  const [port, setPort] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [showScan, setShowScan] = React.useState(false);
  const pageSize = 25;

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (q) params.set('q', q);
  if (port) params.set('port', port);

  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api<Stats>('/api/stats'),
    refetchInterval: 10000,
  });

  const findings = useQuery({
    queryKey: ['findings', q, port, page],
    queryFn: () => api<{ rows: Finding[]; total: number }>(`/api/findings?${params}`),
    refetchInterval: 10000,
  });

  const runs = useQuery({
    queryKey: ['runs'],
    queryFn: () => api<ScanRun[]>('/api/runs'),
    refetchInterval: 30000,
  });

  const topHosts = useQuery({
    queryKey: ['top-hosts'],
    queryFn: () => api<TopHost[]>('/api/top-hosts'),
    refetchInterval: 30000,
  });

  const uniqueRows = React.useMemo(() => {
    const seen = new Set<string>();
    return (findings.data?.rows ?? []).filter((row) => {
      if (seen.has(row.ip)) return false;
      seen.add(row.ip);
      return true;
    });
  }, [findings.data?.rows]);

  const total = findings.data?.total ?? 0;
  const rows = uniqueRows;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(start + pageSize - 1, total);

  return (
    <div className="app">
      <nav className="topnav">
        <div className="nav-left">
          <a href="/" className="logo">
            <Shield size={22} />
            <span>portglass</span>
          </a>
          <a href="/" className="nav-link active">Search</a>
          <a href="/hosts" className="nav-link">Hosts</a>
          <a href="/scans" className="nav-link">Scans</a>
        </div>
        <div className="nav-right">
          <button className="scan-btn" onClick={() => setShowScan(true)}>
            <Plus size={14} /> New Scan
          </button>
          <StatusPill />
          <AuthNav />
        </div>
      </nav>

      <header className="search-hero">
        <div className="search-inner">
          <h1>Explore the Network</h1>
          <p className="search-sub">
            Search across {stats.data?.hosts?.toLocaleString() ?? '—'} hosts and{' '}
            {stats.data?.findings?.toLocaleString() ?? '—'} open-port findings in your authorized infrastructure.
          </p>
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search by IP, banner, service or product..."
            />
            <button className="search-btn">Search</button>
          </div>
          <div className="search-tags">
            <span>Popular:</span>
            {stats.data?.topPorts?.slice(0, 6).map((p) => (
              <button
                key={p.port}
                className={port === String(p.port) ? 'tag-active' : ''}
                onClick={() => { setPort(port === String(p.port) ? '' : String(p.port)); setPage(1); }}
              >
                Port {p.port}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="stats-bar">
        <StatChip label="Findings" value={stats.data?.findings} icon={<Radio size={16} />} />
        <StatChip label="Hosts" value={stats.data?.hosts} icon={<Globe size={16} />} />
        <StatChip label="Ports" value={stats.data?.ports} icon={<Server size={16} />} />
        <StatChip label="Runs" value={stats.data?.runs} icon={<Zap size={16} />} />
      </div>

      {showScan && <ScanModal onClose={() => setShowScan(false)} onStarted={() => runs.refetch()} />}

      <main className="results">
        <aside className="filters">
          <div className="filter-panel">
            <h4>Port Filter</h4>
            <div className="port-grid">
              {(stats.data?.topPorts ?? []).map((p) => (
                <button
                  key={p.port}
                  className={`port-chip ${port === String(p.port) ? 'active' : ''}`}
                  onClick={() => { setPort(port === String(p.port) ? '' : String(p.port)); setPage(1); }}
                >
                  <span className="port-num">{p.port}</span>
                  <span className="port-cnt">{p.count}</span>
                </button>
              ))}
            </div>
            {port && (
              <button className="clear-filter" onClick={() => setPort('')}>Clear port filter</button>
            )}
          </div>

          <div className="filter-panel">
            <h4>Top Hosts</h4>
            <div className="scan-list">
              {(topHosts.data ?? []).map((h) => (
                <Link key={h.ip} href={`/host/${encodeURIComponent(h.ip)}`} className="scan-item-link">
                  <div className="scan-item">
                    <div className="scan-row">
                      <Trophy size={12} />
                      <span className="scan-cidr">{h.ip}</span>
                      <span className="spacer" />
                      <span style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: 11 }}>{h.bestLatencyMs.toFixed(1)}ms</span>
                    </div>
                    <div className="scan-row muted">
                      <Server size={12} />
                      <span>{h.openPorts} ports</span>
                      <span className="spacer" />
                      <span>avg {h.avgLatencyMs.toFixed(1)}ms</span>
                    </div>
                  </div>
                </Link>
              ))}
              {!topHosts.data?.length && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>No top hosts yet.</div>
              )}
            </div>
          </div>

          <div className="filter-panel">
            <h4>Recent Scans</h4>
            <div className="scan-list">
              {(runs.data ?? []).slice(0, 8).map((run) => (
                <Link key={run.id} href={`/scan/${run.id}`} className="scan-item-link">
                  <div className={`scan-item ${!run.finishedAt ? 'scan-active' : ''}`}>
                    <div className="scan-row">
                      <MapPin size={12} />
                      <span className="scan-cidr">{run.cidr}</span>
                      {!run.finishedAt && <span className="scan-pulse" />}
                    </div>
                    <div className="scan-row muted">
                      <Monitor size={12} />
                      <span>{run.ports.split(',').length} ports</span>
                      <span className="spacer" />
                      <span className={!run.finishedAt ? 'scan-status-active' : ''}>{run.finishedAt ? 'Done' : 'Active'}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <section className="results-main">
          <div className="results-header">
            <span className="results-count">
              Showing <b>{rows.length ? `${start}–${end}` : '0'}</b> of <b>{total.toLocaleString()}</b> results
            </span>
            <span className="results-refresh">
              <Activity size={13} />
              Auto-refresh on
            </span>
          </div>

          <div className="results-list">
            {rows.map((f, i) => (
              <HostCard key={f.id} f={f} idx={(page - 1) * pageSize + i} />
            ))}
            {!rows.length && (
              <div className="empty-state">
                <Search size={40} />
                <h3>No results found</h3>
                <p>Try adjusting your search query or port filter.</p>
              </div>
            )}
          </div>

          {total > pageSize && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="page-num">Page {page}</span>
              <button disabled={end >= total} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const queryClient = new QueryClient();

export default function Dashboard() {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardInner />
    </QueryClientProvider>
  );
}
