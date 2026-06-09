"use client";

import { useState } from "react";
import { X, Play, Radio, ChevronDown, ChevronUp } from "lucide-react";

const PRESETS = [
  { label: "Common (21,22,23,53,80,443,554,8443,9000,9443,5000,5001,8080,3389,3306,5432...)", value: "common" },
  { label: "Web only (80,443,8080,8443)", value: "80,443,8080,8443" },
  { label: "Full 1-1024", value: "1-1024" },
  { label: "All ports (1-65535)", value: "all" },
  { label: "Custom", value: "custom" },
];

export default function ScanModal({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const [cidr, setCidr] = useState("");
  const [preset, setPreset] = useState("common");
  const [customPorts, setCustomPorts] = useState("");
  const [threads, setThreads] = useState(2);
  const [concurrency, setConcurrency] = useState(256);
  const [timeout, setTimeout] = useState(0.8);
  const [rate, setRate] = useState(250);
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [proxy, setProxy] = useState("");
  const [discover, setDiscover] = useState(false);

  const portsValue = preset === "custom" ? customPorts : preset;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!cidr.trim()) {
      setError("CIDR is required");
      return;
    }
    if (preset === "custom" && !customPorts.trim()) {
      setError("Custom ports are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          cidr: cidr.trim(),
          ports: portsValue,
          threads,
          concurrency,
          timeout,
          rate,
          proxy: proxy.trim() || undefined,
          discover,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start scan");
      } else {
        onStarted();
        onClose();
      }
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Radio size={16} /> New Scan</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="modal-error">{error}</div>}

            <label className="modal-label">Target CIDR</label>
            <input
              className="modal-input"
              value={cidr}
              onChange={(e) => setCidr(e.target.value)}
              placeholder="192.168.0.0/24"
              required
            />

            <label className="modal-label">Ports</label>
            <select className="modal-input" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>

            {preset === "custom" && (
              <input
                className="modal-input"
                value={customPorts}
                onChange={(e) => setCustomPorts(e.target.value)}
                placeholder="80,443,8080 or 1-1024"
              />
            )}

            <button type="button" className="modal-advanced-toggle" onClick={() => setAdvanced((v) => !v)}>
              {advanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Advanced
            </button>

            {advanced && (
              <div className="modal-advanced">
                <div className="modal-row">
                  <div>
                    <label className="modal-label-small">Threads (max 8)</label>
                    <input className="modal-input-small" type="number" min={1} max={8} value={threads} onChange={(e) => setThreads(parseInt(e.target.value))} />
                  </div>
                  <div>
                    <label className="modal-label-small">Concurrency</label>
                    <input className="modal-input-small" type="number" min={1} max={2048} value={concurrency} onChange={(e) => setConcurrency(parseInt(e.target.value))} />
                  </div>
                  <div>
                    <label className="modal-label-small">Timeout (s)</label>
                    <input className="modal-input-small" type="number" min={0.1} max={10} step={0.1} value={timeout} onChange={(e) => setTimeout(parseFloat(e.target.value))} />
                  </div>
                  <div>
                    <label className="modal-label-small">Rate/s</label>
                    <input className="modal-input-small" type="number" min={0} max={10000} value={rate} onChange={(e) => setRate(parseFloat(e.target.value))} />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label className="modal-label-small">SOCKS5 Proxy (optional)</label>
                  <input
                    className="modal-input"
                    value={proxy}
                    onChange={(e) => setProxy(e.target.value)}
                    placeholder="host:port"
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={discover} onChange={(e) => setDiscover(e.target.checked)} />
                  Discover alive hosts first (fast pre-scan, then full scan only responsive IPs)
                </label>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="modal-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn-primary" disabled={loading}>
              <Play size={14} />
              {loading ? "Starting…" : "Start Scan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
