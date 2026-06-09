import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable, createColumnHelper } from '@tanstack/react-table';
import { Activity, Database, Globe2, Radar, Search, Server } from 'lucide-react';
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

type Stats = { findings: number; hosts: number; ports: number; runs: number; topPorts: { port: number; count: number }[] };

const api = async <T,>(path: string): Promise<T> => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

const col = createColumnHelper<Finding>();
const columns = [
  col.accessor('ip', { header: 'Host', cell: (c) => <span className="ip">{c.getValue()}</span> }),
  col.accessor('port', { header: 'Port', cell: (c) => <span className="port">:{c.getValue()}</span> }),
  col.accessor('latencyMs', { header: 'Latency', cell: (c) => c.getValue() == null ? '—' : `${c.getValue()?.toFixed(1)}ms` }),
  col.accessor('banner', { header: 'Fingerprint', cell: (c) => <span className="banner">{c.getValue() || 'no banner'}</span> }),
  col.accessor('observedAt', { header: 'Observed', cell: (c) => new Date(c.getValue()).toLocaleString() }),
];

function App() {
  const [q, setQ] = React.useState('');
  const [port, setPort] = React.useState('');
  const [page, setPage] = React.useState(1);
  const pageSize = 50;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (q) params.set('q', q);
  if (port) params.set('port', port);

  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('/api/stats'), refetchInterval: 5000 });
  const findings = useQuery({ queryKey: ['findings', q, port, page], queryFn: () => api<{ rows: Finding[]; total: number }>(`/api/findings?${params}`), refetchInterval: 5000 });
  const table = useReactTable({ data: findings.data?.rows ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return <main>
    <section className="hero">
      <div>
        <p className="eyebrow"><Radar size={17}/> private attack-surface index</p>
        <h1>Portglass</h1>
        <p className="sub">A Shodan/Censys-style console for your authorized scanner: searchable hosts, open ports, latency, and captured banners stored in Postgres with Drizzle-backed APIs.</p>
      </div>
      <div className="orb"><Activity size={74}/></div>
    </section>

    <section className="stats">
      <Card icon={<Database/>} label="Findings" value={stats.data?.findings}/>
      <Card icon={<Globe2/>} label="Hosts" value={stats.data?.hosts}/>
      <Card icon={<Server/>} label="Ports" value={stats.data?.ports}/>
      <Card icon={<Radar/>} label="Runs" value={stats.data?.runs}/>
    </section>

    <section className="searchPanel">
      <div className="searchBox"><Search size={19}/><input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search IPs, banners, services… e.g. nginx, ssh, 10.0.4" /></div>
      <input className="portInput" value={port} onChange={e => { setPort(e.target.value.replace(/\D/g, '')); setPage(1); }} placeholder="port" />
    </section>

    <section className="layout">
      <aside className="facet">
        <h3>Top exposed ports</h3>
        {(stats.data?.topPorts ?? []).map(p => <button key={p.port} onClick={() => { setPort(String(p.port)); setPage(1); }}><span>:{p.port}</span><b>{p.count}</b></button>)}
      </aside>
      <section className="tableWrap">
        <div className="tableHead"><b>{findings.data?.total ?? 0}</b> matching open ports</div>
        <table>
          <thead>{table.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map(r => <tr key={r.id}>{r.getVisibleCells().map(c => <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>)}</tbody>
        </table>
        <div className="pager"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page}</span><button disabled={(findings.data?.rows.length ?? 0) < pageSize} onClick={() => setPage(p => p + 1)}>Next</button></div>
      </section>
    </section>
  </main>;
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number }) {
  return <div className="card">{icon}<span>{label}</span><strong>{value?.toLocaleString() ?? '—'}</strong></div>;
}

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
