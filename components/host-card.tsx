"use client";

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Terminal, Wifi } from 'lucide-react';
import Link from 'next/link';
import CopyButton from './copy-button';
import { curlFor } from '@/lib/commands';
import DeviceBadge from './device-badge';
import type { DeviceType } from '@/lib/classify';

function flagEmoji(iso: string | null): string {
  if (!iso || iso.length !== 2) return '';
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + iso.toUpperCase().charCodeAt(0) - 65,
    A + iso.toUpperCase().charCodeAt(1) - 65,
  );
}

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
    headers?: string | null;
    service: string | null;
    product: string | null;
    observedAt: string;
    countryIso?: string | null;
    countryName?: string | null;
    asn?: number | null;
    org?: string | null;
    device?: { type: DeviceType; label: string; confidence: 'high' | 'medium' | 'low' } | null;
  };
  idx: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!(f.banner || f.headers);

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
              {f.device && (
                <DeviceBadge type={f.device.type} label={f.device.label} confidence={f.device.confidence} />
              )}
              <span className="badge badge-green">OPEN</span>
              <span className="badge badge-cyan">PORT {f.port}</span>
              {f.service && <span className="badge badge-amber">{f.service.toUpperCase()}</span>}
              {f.product && <span className="badge badge-slate">{f.product}</span>}
              {f.countryIso && (
                <span className="badge badge-slate" title={f.countryName || ''}>
                  {flagEmoji(f.countryIso)} {f.countryIso}
                </span>
              )}
              {f.asn && (
                <span className="badge badge-slate" title={f.org || ''}>AS{f.asn}</span>
              )}
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

      <div className="card-actions">
        <CopyButton text={curlFor(f.ip, f.port, f.service)} label="curl" title="Copy as curl" />
        <CopyButton text={`${f.ip}:${f.port}`} label="ip:port" title="Copy ip:port" />
        {hasDetail && (
          <button
            type="button"
            className="card-detail-toggle"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Less' : 'Details'}
          </button>
        )}
      </div>

      {!expanded && f.banner && (
        <div className="banner-block">
          <div className="banner-header">
            <Terminal size={13} />
            <span>BANNER</span>
          </div>
          <pre className="banner-body">{f.banner.slice(0, 280)}{f.banner.length > 280 ? '…' : ''}</pre>
        </div>
      )}

      {expanded && hasDetail && (
        <div className="card-detail">
          {f.banner && (
            <div className="banner-block">
              <div className="banner-header">
                <Terminal size={13} />
                <span>BANNER</span>
                <CopyButton text={f.banner} title="Copy banner" className="ml-auto" />
              </div>
              <pre className="banner-body">{f.banner}</pre>
            </div>
          )}
          {f.headers && (
            <div className="banner-block">
              <div className="banner-header">
                <Terminal size={13} />
                <span>HEADERS / PROTOCOL</span>
                <CopyButton text={f.headers} title="Copy headers" className="ml-auto" />
              </div>
              <pre className="banner-body">{f.headers}</pre>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
