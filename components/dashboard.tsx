"use client";

import React from 'react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query';
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Globe,
  Radio,
  Search,
  Server,
  Wifi,
  Zap,
} from 'lucide-react';
import TopNav from "./top-nav";
import HostCard from './host-card';
import DeviceBadge from './device-badge';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { downloadText, toCsv } from '@/lib/export';
import { deviceLabel, DEVICE_ORDER, type DeviceType } from '@/lib/classify';

type Finding = {
  id: number;
  runId: number | null;
  ip: string;
  port: number;
  state: string;
  latencyMs: number | null;
  banner: string | null;
  headers: string | null;
  service: string | null;
  product: string | null;
  observedAt: string;
  countryIso?: string | null;
  countryName?: string | null;
  asn?: number | null;
  org?: string | null;
  device?: { type: DeviceType; label: string; confidence?: 'high' | 'medium' | 'low' } | null;
  ports?: { port: number; service: string | null }[];
};

type Stats = {
  findings: number;
  hosts: number;
  ports: number;
  runs: number;
  topPorts: { port: number; count: number }[];
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

function DashboardInner() {
  const searchParams = useSearchParams();
  const initialDevice = searchParams.get('device') as DeviceType | null;
  const initialAsn = searchParams.get('asn');
  const [q, setQ] = React.useState('');
  const [port, setPort] = React.useState('');
  const [device, setDevice] = React.useState<DeviceType | ''>(
    initialDevice && DEVICE_ORDER.includes(initialDevice) ? initialDevice : ''
  );
  const [asn, setAsn] = React.useState<number | null>(
    initialAsn && /^\d+$/.test(initialAsn) ? Number(initialAsn) : null
  );
  const [software, setSoftware] = React.useState<string>(searchParams.get('software') ?? '');
  const [showAllAsn, setShowAllAsn] = React.useState(false);
  const [showAllSoftware, setShowAllSoftware] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const pageSize = 25;

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (q) params.set('q', q);
  if (port) params.set('port', port);
  if (device) params.set('device', device);
  if (asn) params.set('asn', String(asn));
  if (software) params.set('software', software);

  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api<Stats>('/api/stats'),
    refetchInterval: 10000,
  });

  const findings = useQuery({
    queryKey: ['findings', q, port, page, device, asn, software],
    queryFn: () => api<{ rows: Finding[]; total: number }>(`/api/findings?${params}`),
    refetchInterval: 10000,
  });

  const softwareFacet = useQuery({
    queryKey: ['software'],
    queryFn: () => api<{ software: { key: string; label: string; count: number }[] }>('/api/software'),
    refetchInterval: 120000,
  });

  const deviceTypes = useQuery({
    queryKey: ['device-types'],
    queryFn: () => api<{ types: { device_type: DeviceType; count: number }[] }>('/api/device-types'),
    refetchInterval: 60000,
  });

  const asns = useQuery({
    queryKey: ['asns'],
    queryFn: () => api<{ asns: { asn: number; org: string | null; count: number }[] }>('/api/asns'),
    refetchInterval: 120000,
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
      <TopNav />

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

      <main className="results">
        <aside className="filters">
          <div className="filter-panel">
            <h4>Device Type</h4>
            <div className="device-filter">
              {(() => {
                const counts = new Map(
                  (deviceTypes.data?.types ?? []).map((t) => [t.device_type, t.count])
                );
                const present = DEVICE_ORDER.filter((t) => counts.has(t) || t === device);
                if (!present.length) {
                  return (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>
                      No devices detected yet.
                    </div>
                  );
                }
                return present.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`device-filter-item ${device === t ? 'active' : ''}`}
                    onClick={() => { setDevice(device === t ? '' : t); setPage(1); }}
                  >
                    <DeviceBadge type={t} label={deviceLabel(t)} />
                    <span className="device-filter-count">{counts.get(t) ?? 0}</span>
                  </button>
                ));
              })()}
            </div>
            {device && (
              <button className="clear-filter" onClick={() => { setDevice(''); setPage(1); }}>
                Clear device filter
              </button>
            )}
          </div>

          <div className="filter-panel">
            <h4>Software</h4>
            <div className="facet-list">
              {(softwareFacet.data?.software ?? []).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>
                  No software detected yet.
                </div>
              )}
              {(softwareFacet.data?.software ?? [])
                .slice(0, showAllSoftware ? undefined : 6)
                .map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`facet-item ${software === s.key ? 'active' : ''}`}
                    onClick={() => { setSoftware(software === s.key ? '' : s.key); setPage(1); }}
                  >
                    <span className="facet-label">{s.label}</span>
                    <span className="facet-count">{s.count.toLocaleString()}</span>
                  </button>
                ))}
              {(softwareFacet.data?.software?.length ?? 0) > 6 && (
                <button className="facet-more" onClick={() => setShowAllSoftware((v) => !v)}>
                  {showAllSoftware ? 'Less' : 'More'}
                  {showAllSoftware ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
            </div>
            {software && (
              <button className="clear-filter" onClick={() => { setSoftware(''); setPage(1); }}>
                Clear software filter
              </button>
            )}
          </div>

          <div className="filter-panel">
            <h4>Network (ASN)</h4>
            <div className="facet-list">
              {(asns.data?.asns ?? []).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>
                  No ASN data yet.
                </div>
              )}
              {(asns.data?.asns ?? [])
                .slice(0, showAllAsn ? undefined : 6)
                .map((a) => (
                  <button
                    key={a.asn}
                    type="button"
                    className={`asn-item ${asn === a.asn ? 'active' : ''}`}
                    title={a.org ?? undefined}
                    onClick={() => { setAsn(asn === a.asn ? null : a.asn); setPage(1); }}
                  >
                    <span className="asn-num">AS{a.asn}</span>
                    <span className="asn-org">{a.org ?? '—'}</span>
                    <span className="facet-count">{a.count}</span>
                  </button>
                ))}
              {(asns.data?.asns?.length ?? 0) > 6 && (
                <button className="facet-more" onClick={() => setShowAllAsn((v) => !v)}>
                  {showAllAsn ? 'Less' : 'More'}
                  {showAllAsn ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
            </div>
            {asn && (
              <button className="clear-filter" onClick={() => { setAsn(null); setPage(1); }}>
                Clear ASN filter
              </button>
            )}
          </div>

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
        </aside>

        <section className="results-main">
          <div className="results-header">
            <span className="results-count">
              Showing <b>{rows.length ? `${start}–${end}` : '0'}</b> of <b>{total.toLocaleString()}</b> results
            </span>
            <span className="results-refresh">
              {rows.length > 0 && (
                <>
                  <button
                    type="button"
                    className="results-export"
                    title="Download the current page as JSON"
                    onClick={() => downloadText('portglass-page.json', JSON.stringify(rows, null, 2), 'application/json')}
                  >
                    <Download size={13} /> Page JSON
                  </button>
                  <button
                    type="button"
                    className="results-export"
                    title="Download the current page as CSV"
                    onClick={() =>
                      downloadText(
                        'portglass-page.csv',
                        toCsv(
                          rows.map((r) => ({
                            ip: r.ip,
                            port: r.port,
                            service: r.service ?? '',
                            product: r.product ?? '',
                            latency_ms: r.latencyMs ?? '',
                            country: r.countryIso ?? '',
                            asn: r.asn ?? '',
                            banner: r.banner ?? '',
                            observed_at: r.observedAt,
                          }))
                        ),
                        'text/csv'
                      )
                    }
                  >
                    <Download size={13} /> Page CSV
                  </button>
                </>
              )}
              {/* Full dump of every finding, streamed from the server. */}
              <a className="results-export results-export-all" href="/api/export?format=json" title="Download ALL findings as JSON">
                <Download size={13} /> All JSON
              </a>
              <a className="results-export results-export-all" href="/api/export?format=csv" title="Download ALL findings as CSV">
                <Download size={13} /> All CSV
              </a>
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
              <span className="page-num">
                Page {page} of {Math.max(1, Math.ceil(total / pageSize)).toLocaleString()}
              </span>
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

const queryClient = makeQueryClient();

export default function Dashboard() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* useSearchParams (device deep-link) needs a Suspense boundary. */}
      <React.Suspense fallback={null}>
        <DashboardInner />
      </React.Suspense>
    </QueryClientProvider>
  );
}
