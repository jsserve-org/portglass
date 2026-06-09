import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  MapPin,
  Monitor,
  Radio,
  Search,
  Server,
  Shield,
  Terminal,
  Wifi,
} from 'lucide-react';
import './style.css';

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

const api = async <T,>(path: string): Promise<T> => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

/* ─── Mini Components ─── */
function Badge({ children, variant = 'green' }: { children: React.ReactNode; variant?: 'green' | 'amber' | 'cyan' | 'slate' }) {
  const map = {
    green: 'badge-green',
    amber: 'badge-amber',
    cyan: 'badge-cyan',
    slate: 'badge-slate',
  };
  return <span className={`badge ${map[variant]}`}>{children}</span>;
}

function StatusPill() {
  return (
    <span className="status-pill">
      <span className="dot" />
      ONLINE
    </span>
  );
}

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

/* ─── Host Card ─── */
function HostCard({
  f,
  idx,
}: {
  f: Finding;
  idx: number;
}) {
  return (
    <article className="host-card">
      <div className="card-header">
        <div className="card-left">
          <span className="idx">#{String(idx + 1).padStart(3, '0')}</span>
          <div className="host-info">
            <a className="ip-link" href={`/api/findings?q=${f.ip}`} onClick={(e) => e.preventDefault()}>
              {f.ip}
              <ExternalLink size={12} />
            </a>
            <div className="host-meta">
              <Badge variant="green">OPEN</Badge>
              <Badge variant="cyan">PORT {f.port}</Badge>
              {f.service && <Badge variant="amber">{f.service.toUpperCase()}</Badge>}
              {f.product && <Badge variant="slate">{f.product}</Badge>}
            </div>
          </div>
        </div>
        <div className="card-right">
          <span className="latency">
            <Wifi size={13} />
            {f.latencyMs != null ? `${f.latencyMs.toFixed(1)} ms` : '—'}
          </span>
          <span className="date">
            {new Date(f.observedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>

      {f.banner && (
        <div className="banner-block">
          <div className="banner-header">
            <Terminal size={13} />
            <span>BANNER</span>
          </div>
          <pre className="banner-body">{f.banner.slice(0, 280)}{f.banner.length > 280 ? '…' : ''}</pre>
        </div>
      )}
    </article>
  );
}

/* ─── App ─── */
function App() {
  const [q, setQ] = React.useState('');
  const [port, setPort] = React.useState('');
  const [page, setPage] = React.useState(1);
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

  const total = findings.data?.total ?? 0;
  const rows = findings.data?.rows ?? [];
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(start + pageSize - 1, total);

  return (
    <div className="app">
      {/* Top Navigation */}
      <nav className="topnav">
        <div className="nav-left">
          <div className="logo">
            <Shield size={22} />
            <span>portglass</span>
          </div>
          <a href="/" className="nav-link active">Search</a>
          <a href="/api/runs" className="nav-link">Runs</a>
        </div>
        <div className="nav-right">
          <StatusPill />
        </div>
      </nav>

      {/* Hero Search */}
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
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
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
                onClick={() => {
                  setPort(port === String(p.port) ? '' : String(p.port));
                  setPage(1);
                }}
              >
                Port {p.port}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Stats strip */}
      <div className="stats-bar">
        <StatChip label="Findings" value={stats.data?.findings} icon={<Radio size={16} />} />
        <StatChip label="Hosts" value={stats.data?.hosts} icon={<Globe size={16} />} />
        <StatChip label="Ports" value={stats.data?.ports} icon={<Server size={16} />} />
        <StatChip label="Runs" value={stats.data?.runs} icon={<Activity size={16} />} />
      </div>

      {/* Main Content */}
      <main className="results">
        {/* Sidebar Filters */}
        <aside className="filters">
          <div className="filter-panel">
            <h4>Port Filter</h4>
            <div className="port-grid">
              {(stats.data?.topPorts ?? []).map((p) => (
                <button
                  key={p.port}
                  className={`port-chip ${port === String(p.port) ? 'active' : ''}`}
                  onClick={() => {
                    setPort(port === String(p.port) ? '' : String(p.port));
                    setPage(1);
                  }}
                >
                  <span className="port-num">{p.port}</span>
                  <span className="port-cnt">{p.count}</span>
                </button>
              ))}
            </div>
            {port && (
              <button className="clear-filter" onClick={() => setPort('')}>
                Clear port filter
              </button>
            )}
          </div>

          <div className="filter-panel">
            <h4>Recent Scans</h4>
            <div className="scan-list">
              {(runs.data ?? []).slice(0, 6).map((run) => (
                <div key={run.id} className="scan-item">
                  <div className="scan-row">
                    <MapPin size={12} />
                    <span className="scan-cidr">{run.cidr}</span>
                  </div>
                  <div className="scan-row muted">
                    <Monitor size={12} />
                    <span>{run.ports.split(',').length} ports</span>
                    <span className="spacer" />
                    <span>{run.finishedAt ? 'Done' : 'Active'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Results List */}
        <section className="results-main">
          <div className="results-header">
            <span className="results-count">
              Showing <b>{rows.length ? `${start}–${end}` : '0'}</b> of <b>{total.toLocaleString()}</b> results
            </span>
            <span className="results-refresh">
              <Activity size={13} className="spin" />
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
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
