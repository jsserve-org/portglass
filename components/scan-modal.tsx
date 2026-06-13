"use client";

import { useState } from "react";
import { X, Play, Radio, ChevronDown, ChevronUp, ShieldOff, Crosshair, Microscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "Common (21,22,23,53,80,443,554,8443,9000,9443,5000,5001,8080,3389,3306,5432...)", value: "common" },
  { label: "Web only (80,443,8080,8443)", value: "80,443,8080,8443" },
  { label: "Full 1-1024", value: "1-1024" },
  { label: "All ports (1-65535)", value: "all" },
  { label: "Custom", value: "custom" },
];

function OptionRow({
  checked,
  onChange,
  icon,
  title,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-start gap-3 rounded-sm border p-3 text-left transition-colors",
        checked ? "border-signal bg-signal/[0.07]" : "border-border bg-muted hover:border-input"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[3px] border",
          checked ? "border-signal bg-signal text-[#04140b]" : "border-input"
        )}
      >
        {checked && (
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={4}>
            <path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0">
        <span className={cn("flex items-center gap-1.5 text-[13px] font-semibold", checked ? "text-signal" : "text-foreground", "[&_svg]:size-3.5")}>
          {icon}
          {title}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}

export default function ScanModal({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const [cidr, setCidr] = useState("");
  const [preset, setPreset] = useState("common");
  const [customPorts, setCustomPorts] = useState("");
  const [threads, setThreads] = useState(4);
  const [concurrency, setConcurrency] = useState(512);
  const [timeout, setTimeout] = useState(0.8);
  const [rate, setRate] = useState(750);
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [proxy, setProxy] = useState("");
  const [discover, setDiscover] = useState(false);
  const [stealth, setStealth] = useState(false);
  const [deep, setDeep] = useState(false);

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
          stealth,
          deep,
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

            <div className="flex flex-col gap-2">
              <OptionRow
                checked={deep}
                onChange={setDeep}
                icon={<Microscope />}
                title="Deep service scan"
                desc="Read banners on every open port (not just HTTP), probe non-standard HTTP servers, re-verify to merge the best fingerprint, and allow longer reads. Surfaces software, versions and OS (e.g. Apache 2.4 / Debian 12) for the Technology panel. Slower per host."
              />
              <OptionRow
                checked={stealth}
                onChange={setStealth}
                icon={<ShieldOff />}
                title="Low-and-slow mode"
                desc="Probes one connection at a time, interleaves ports across hosts, randomises order, adds jitter and holds the rate low to slip under simple port-scan thresholds. It's a full TCP connect scan, so it's not true IDS evasion — lower the rate further if you still get flagged. Much slower."
              />
              <OptionRow
                checked={discover}
                onChange={setDiscover}
                icon={<Crosshair />}
                title="Discover alive hosts first"
                desc="Fast pre-scan over common ports, then full scan only the responsive IPs. Faster on sparse ranges."
              />
            </div>

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
                {stealth && (
                  <p className="mt-2 text-[11px] leading-snug text-amber">
                    Low-and-slow mode overrides these: concurrency is forced to 1, rate held at ~4/s, and retries are disabled.
                  </p>
                )}
                <div style={{ marginTop: 10 }}>
                  <label className="modal-label-small">SOCKS5 Proxy (optional)</label>
                  <input
                    className="modal-input"
                    value={proxy}
                    onChange={(e) => setProxy(e.target.value)}
                    placeholder="host:port"
                  />
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              <Play size={14} />
              {loading ? "Starting…" : "Start Scan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
