"use client";

import { useState } from "react";
import { X, Play, Radio, ChevronDown, ChevronUp } from "lucide-react";

const PRESETS = [
  { label: "Common (7 ports)", value: "common" },
  { label: "Top 100", value: "top100" },
  { label: "Web only (80,443,8080,8443)", value: "80,443,8080,8443" },
  { label: "Full 1-1024", value: "1-1024" },
  { label: "Custom", value: "custom" },
];

export default function ScanModal({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const [cidr, setCidr] = useState("");
  const [preset, setPreset] = useState("common");
  const [customPorts, setCustomPorts] = useState("");
  const [threads, setThreads] = useState(4);
  const [concurrency, setConcurrency] = useState(512);
  const [timeout, setTimeout] = useState(0.8);
  const [rate, setRate] = useState(250);
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
                    <label className="modal-label-small">Threads</label>
                    <input className="modal-input-small" type="number" min={1} max={32} value={threads} onChange={(e) => setThreads(parseInt(e.target.value))} />
                  </div>
                  <div>
                    <label className="modal-label-small">Concurrency</label>
                    <input className="modal-input-small" type="number" min={1} max={4096} value={concurrency} onChange={(e) => setConcurrency(parseInt(e.target.value))} />
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
