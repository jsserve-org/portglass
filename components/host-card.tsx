import { ExternalLink, Terminal, Wifi } from 'lucide-react';
import Link from 'next/link';

export default function HostCard({
  f,
  idx,
}: {
  f: {
    id: number;
    ip: string;
    port: number;
    latencyMs: number | null;
    banner: string | null;
    service: string | null;
    product: string | null;
    observedAt: string;
  };
  idx: number;
}) {
  return (
    <article className="host-card">
      <div className="card-header">
        <div className="card-left">
          <span className="idx">#{String(idx + 1).padStart(3, '0')}</span>
          <div className="host-info">
            <Link className="ip-link" href={`/host/${encodeURIComponent(f.ip)}`}>
              {f.ip}
              <ExternalLink size={12} />
            </Link>
            <div className="host-meta">
              <span className="badge badge-green">OPEN</span>
              <span className="badge badge-cyan">PORT {f.port}</span>
              {f.service && <span className="badge badge-amber">{f.service.toUpperCase()}</span>}
              {f.product && <span className="badge badge-slate">{f.product}</span>}
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
