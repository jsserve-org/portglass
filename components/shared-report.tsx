"use client";

import { useEffect, useState } from "react";
import { Shield, Lock, Clock, Globe, Radio, Server, Download, AlertTriangle } from "lucide-react";
import { downloadText, toCsv } from "@/lib/export";

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
type Geo = { countryIso: string | null; countryName: string | null; asn: number | null; org: string | null };
type ScanSnap = { kind: "scan"; run: any; geo: Geo; findings: Finding[]; stats: { hosts: number }; capturedAt: string };
type HostSnap = { kind: "host"; ip: string; geo: Geo; findings: Finding[]; capturedAt: string };
type Snap = ScanSnap | HostSnap;
type Meta = { kind: string; title: string | null; createdAt: string; expiresAt: string | null; needsPassword: boolean; data?: Snap };

function flagEmoji(iso: string | null): string {
  if (!iso || iso.length !== 2) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + iso.toUpperCase().charCodeAt(0) - 65, A + iso.toUpperCase().charCodeAt(1) - 65);
}

export default function SharedReport({ token }: { token: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [data, setData] = useState<Snap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(async (r) => {
        if (r.status === 404) throw new Error("This shared report does not exist.");
        if (r.status === 410) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.error === "expired" ? "This shared report has expired." : "This shared report has been revoked.");
        }
        if (!r.ok) throw new Error("Could not load this report.");
        return r.json() as Promise<Meta>;
      })
      .then((m) => {
        setMeta(m);
        if (m.data) setData(m.data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlocking(true);
    setError(null);
    try {
      const r = await fetch(`/api/share/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (r.status === 401) throw new Error("Incorrect password.");
      if (r.status === 410) throw new Error("This shared report is no longer available.");
      if (!r.ok) throw new Error("Could not unlock this report.");
      const body = await r.json();
      setData(body.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUnlocking(false);
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <span className="spinner" />
          <p>Loading shared report…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="share-page">
        <div className="share-gate">
          <AlertTriangle size={40} />
          <h1>Report unavailable</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (meta?.needsPassword && !data) {
    return (
      <div className="share-page">
        <form className="share-gate" onSubmit={unlock}>
          <Lock size={36} />
          <h1>Password required</h1>
          <p>This shared report is protected. Enter the passphrase to view it.</p>
          <input
            type="password"
            className="modal-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passphrase"
            autoFocus
          />
          {error && <p className="login-error">{error}</p>}
          <button className="auth-btn" type="submit" disabled={unlocking || !password}>
            {unlocking ? "Unlocking…" : "View report"}
          </button>
        </form>
      </div>
    );
  }

  if (!data) return null;

  const findings = data.findings;
  const geo = data.geo;
  const title =
    meta?.title || (data.kind === "scan" ? `Scan ${data.run.cidr}` : `Host ${data.ip}`);

  const exportJson = () => downloadText(`${title.replace(/\s+/g, "_")}.json`, JSON.stringify(data, null, 2), "application/json");
  const exportCsv = () =>
    downloadText(
      `${title.replace(/\s+/g, "_")}.csv`,
      toCsv(
        findings.map((f) => ({
          ip: f.ip, port: f.port, service: f.service ?? "", product: f.product ?? "",
          latency_ms: f.latencyMs ?? "", banner: f.banner ?? "", observed_at: f.observedAt,
        }))
      ),
      "text/csv"
    );

  return (
    <div className="share-page">
      <div className="share-report">
        <header className="share-report-head">
          <div className="share-brand">
            <Shield size={18} />
            <span>PORTGLASS</span>
            <span className="share-tag">Shared Report</span>
          </div>
          <div className="share-actions">
            <button onClick={exportJson} className="results-export"><Download size={13} /> JSON</button>
            <button onClick={exportCsv} className="results-export"><Download size={13} /> CSV</button>
          </div>
        </header>

        <h1 className="share-title">{title}</h1>
        <div className="share-meta">
          {data.kind === "scan" ? (
            <>
              <span><Server size={12} /> {data.run.ports.split(",").length} ports</span>
              <span><Globe size={12} /> {data.stats.hosts} host{data.stats.hosts === 1 ? "" : "s"}</span>
              <span><Clock size={12} /> Started {new Date(data.run.startedAt).toLocaleString()}</span>
            </>
          ) : (
            <span><Radio size={12} /> {findings.length} open port{findings.length === 1 ? "" : "s"}</span>
          )}
          {geo?.countryIso && <span><Globe size={12} /> {flagEmoji(geo.countryIso)} {geo.countryName || geo.countryIso}</span>}
          {geo?.asn != null && <span title={geo.org || ""}><Server size={12} /> AS{geo.asn}{geo.org ? ` · ${geo.org}` : ""}</span>}
          <span className="share-captured"><Clock size={12} /> Snapshot {new Date(data.capturedAt).toLocaleString()}</span>
        </div>

        <div className="share-findings">
          <table className="findings-table">
            <thead>
              <tr>
                <th>IP</th><th>Port</th><th>Service</th><th>Product</th><th>Latency</th><th>Banner</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id}>
                  <td className="font-mono">{f.ip}</td>
                  <td><span className="badge badge-cyan">{f.port}</span></td>
                  <td>{f.service || "—"}</td>
                  <td className="cell-ellipsis" title={f.product || ""}>{f.product || "—"}</td>
                  <td>{f.latencyMs != null ? `${f.latencyMs.toFixed(1)}ms` : "—"}</td>
                  <td className="cell-ellipsis" title={f.banner || ""}>{f.banner || "—"}</td>
                </tr>
              ))}
              {!findings.length && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 24 }}>No open ports recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="share-foot">
          <Shield size={12} /> Generated by Portglass · read-only snapshot
          {meta?.expiresAt && <> · expires {new Date(meta.expiresAt).toLocaleDateString()}</>}
        </footer>
      </div>
    </div>
  );
}
