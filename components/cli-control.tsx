"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Laptop, Link2, RefreshCw, ShieldCheck, TerminalSquare, Trash2 } from "lucide-react";
import TopNav from "./top-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "./toast";
import { timeAgo, timeProps } from "@/lib/format";

type Device = {
  id: string;
  name: string;
  platform: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const normalizeCode = (value: string) => {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
};

export default function CliControl() {
  const search = useSearchParams();
  const qc = useQueryClient();
  const [code, setCode] = useState(() => normalizeCode(search.get("code") || ""));
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const installSh = "curl -fsSL https://scan.2oo.dev/cli/install.sh | sh";
  const installPs = "irm https://scan.2oo.dev/cli/install.ps1 | iex";

  // React Query instead of a fire-and-forget effect: a failed request used to
  // be masked as "no devices linked yet", prompting unnecessary re-logins.
  const devicesQ = useQuery({
    queryKey: ["cli-devices"],
    queryFn: async (): Promise<Device[]> => {
      const res = await fetch("/api/cli/devices", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load devices");
      return res.json();
    },
    staleTime: 15_000,
  });
  const devices = devicesQ.data ?? [];

  const activeDevices = useMemo(() => devices.filter((device) => !device.revokedAt), [devices]);

  const copy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Couldn't copy — clipboard is blocked in this browser/context");
    }
  };

  const approve = async () => {
    setBusy(true);
    setSuccessMessage(null);
    setApproveError(null);
    try {
      const res = await fetch("/api/cli/device/approve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: code }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not link device");
      setSuccessMessage(`${body.device.deviceName} approved. Return to the terminal.`);
      setCode("");
      qc.invalidateQueries({ queryKey: ["cli-devices"] });
    } catch (error) {
      setApproveError(error instanceof Error ? error.message : "Could not link device");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (device: Device) => {
    // Revocation forces physically revisiting that machine to re-link it.
    if (!window.confirm(`Revoke "${device.name}"? Its CLI token stops working immediately.`)) return;
    setRevokingId(device.id);
    try {
      const res = await fetch(`/api/cli/devices/${encodeURIComponent(device.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Revoke failed");
      toast.success(`${device.name} revoked`);
      await qc.invalidateQueries({ queryKey: ["cli-devices"] });
    } catch {
      toast.error(`Couldn't revoke ${device.name} — try again`);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="app">
      <TopNav active="/cli" />
      <main className="mx-auto w-full max-w-[1120px] px-5 py-10 md:px-8">
        <div className="mb-8 grid gap-7 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
          <div>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[2.5px] text-signal">Remote sensor control</span>
            <h1 className="mt-2 max-w-3xl font-[var(--font-cond)] text-4xl font-bold uppercase tracking-tight text-foreground md:text-5xl">
              Your terminal,<br /><span className="text-beam">wired into Portglass.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              Link a trusted machine once, then activate authorized scans, follow progress, and download results without handling browser cookies or API keys.
            </p>
          </div>
          <div className="border-l border-signal/30 pl-5 font-mono text-xs leading-6 text-muted-foreground">
            <div><span className="text-signal">$</span> portglass login</div>
            <div><span className="text-signal">$</span> portglass activate 192.0.2.0/28 -p common</div>
            <div><span className="text-signal">$</span> portglass status 1042</div>
            <div><span className="text-signal">$</span> portglass download 1042 --format csv</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden border-signal/25">
            <CardHeader className="bg-signal/[.06]">
              <CardTitle><Link2 /> Link this terminal</CardTitle>
              <Badge>{activeDevices.length} active</Badge>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start gap-3 rounded-sm border border-border bg-muted p-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-signal" />
                <p className="text-xs leading-5 text-muted-foreground">Run <code className="font-mono text-foreground">portglass login</code>, verify the machine name, then enter its one-time code here. Codes expire after 10 minutes.</p>
              </div>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[1.3px] text-muted-foreground">Device code</span>
                <input
                  value={code}
                  onChange={(event) => setCode(normalizeCode(event.target.value))}
                  placeholder="ABCD-EFGH"
                  autoComplete="one-time-code"
                  className="h-14 w-full rounded-sm border border-input bg-background px-4 text-center font-mono text-2xl font-semibold tracking-[.25em] text-beam outline-none transition focus:border-signal focus:ring-1 focus:ring-signal"
                />
              </label>
              <Button className="w-full" size="lg" disabled={busy || code.length !== 9} onClick={approve}>
                {busy ? "Approving…" : "Approve linked device"}
              </Button>
              {successMessage && <p className="text-center font-mono text-xs text-signal" role="status">{successMessage}</p>}
              {approveError && (
                <p className="text-center font-mono text-xs text-destructive" role="alert">{approveError}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle><TerminalSquare /> Install the CLI</CardTitle><Badge variant="beam">latest</Badge></CardHeader>
            <CardContent className="space-y-4 p-5">
              {[["macOS / Linux / Fedora", installSh, "sh"], ["Windows PowerShell", installPs, "ps"]].map(([label, command, id]) => (
                <div key={id}>
                  <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[1.3px] text-muted-foreground">{label}</div>
                  <button onClick={() => copy(command, id)} className="group flex w-full items-center justify-between gap-3 rounded-sm border border-border bg-[#0a0d12] px-3.5 py-3 text-left transition hover:border-beam/50">
                    <code className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-foreground">{command}</code>
                    {copied === id ? <Check className="size-4 shrink-0 text-signal" /> : <Copy className="size-4 shrink-0 text-muted-foreground group-hover:text-beam" />}
                  </button>
                </div>
              ))}
              <p className="text-xs leading-5 text-muted-foreground">Installers verify the operating system and CPU architecture, then download the matching binary from the latest GitHub release.</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader><CardTitle><Laptop /> Linked devices</CardTitle><Badge variant="slate">token hashes only</Badge></CardHeader>
          {devicesQ.isLoading ? (
            <CardContent className="py-9 text-center text-sm text-muted-foreground">
              <span className="spinner" style={{ width: 16, height: 16 }} /> Loading devices…
            </CardContent>
          ) : devicesQ.isError ? (
            <CardContent className="flex flex-col items-center gap-3 py-9 text-center text-sm text-muted-foreground">
              Couldn&apos;t load your linked devices.
              <Button variant="outline" size="sm" onClick={() => devicesQ.refetch()}>
                <RefreshCw /> Retry
              </Button>
            </CardContent>
          ) : devices.length ? (
            <div className="divide-y divide-border">
              {devices.map((device) => (
                <div key={device.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="font-medium text-foreground">{device.name}</span>{device.revokedAt && <Badge variant="slate">revoked</Badge>}</div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {device.platform || "unknown platform"}
                      {" · linked "}
                      <time {...timeProps(device.createdAt)}>{timeAgo(device.createdAt)}</time>
                      {" · "}
                      {device.lastUsedAt ? <>last used <time {...timeProps(device.lastUsedAt)}>{timeAgo(device.lastUsedAt)}</time></> : "never used"}
                    </div>
                  </div>
                  {!device.revokedAt && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={revokingId === device.id}
                      onClick={() => revoke(device)}
                    >
                      <Trash2 /> {revokingId === device.id ? "Revoking…" : "Revoke"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : <CardContent className="py-9 text-center text-sm text-muted-foreground">No CLI devices are linked yet.</CardContent>}
        </Card>
      </main>
    </div>
  );
}
