"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat, Ban, Trash2, Plus, ChevronDown, ChevronUp, Pause, Play } from "lucide-react";

type Schedule = {
  id: number;
  cidr: string;
  ports: string;
  label: string | null;
  intervalMinutes: number;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastRunId: number | null;
};

type SkipSubnet = { id: number; cidr: string; reason: string | null; createdAt: string };

function humanInterval(min: number): string {
  if (min === 60) return "hourly";
  if (min === 1440) return "daily";
  if (min === 10080) return "weekly";
  if (min % 1440 === 0) return `every ${min / 1440}d`;
  if (min % 60 === 0) return `every ${min / 60}h`;
  return `every ${min}m`;
}

function nextRunLabel(schedule: Schedule): string {
  const next = new Date(schedule.nextRunAt);
  if (schedule.enabled && next.getTime() <= Date.now()) return "due now";
  return next.toLocaleString();
}

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export default function ManagePanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [skipCidr, setSkipCidr] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [skipErr, setSkipErr] = useState("");

  const schedules = useQuery({
    queryKey: ["schedules"],
    queryFn: () => jsonFetch("/api/schedules") as Promise<{ schedules: Schedule[] }>,
    refetchInterval: 30000,
  });
  const skips = useQuery({
    queryKey: ["skip-subnets"],
    queryFn: () => jsonFetch("/api/skip-subnets") as Promise<{ subnets: SkipSubnet[] }>,
  });

  const scheduleRows = schedules.data?.schedules ?? [];
  const skipRows = skips.data?.subnets ?? [];
  const activeSchedules = scheduleRows.filter((s) => s.enabled).length;

  const toggleSchedule = async (s: Schedule) => {
    await jsonFetch(`/api/schedules/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !s.enabled }),
    }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["schedules"] });
  };
  const deleteSchedule = async (id: number) => {
    await jsonFetch(`/api/schedules/${id}`, { method: "DELETE" }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["schedules"] });
  };
  const addSkip = async () => {
    setSkipErr("");
    if (!skipCidr.trim()) return;
    try {
      await jsonFetch("/api/skip-subnets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cidr: skipCidr.trim(), reason: skipReason.trim() || undefined }),
      });
      setSkipCidr("");
      setSkipReason("");
      qc.invalidateQueries({ queryKey: ["skip-subnets"] });
    } catch (e: any) {
      setSkipErr(e.message || "Failed to add");
    }
  };
  const deleteSkip = async (id: number) => {
    await jsonFetch(`/api/skip-subnets?id=${id}`, { method: "DELETE" }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["skip-subnets"] });
  };

  return (
    <div className="mb-3.5 overflow-hidden rounded-md border border-border bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&_svg]:size-3.5 [&_svg]:text-signal">
          <Repeat /> Automation
          <span className="ml-1 inline-flex items-center gap-3 text-[10px] font-normal normal-case tracking-normal text-[var(--text-dim)]">
            <span>{activeSchedules} active schedule{activeSchedules === 1 ? "" : "s"}</span>
            <span>{skipRows.length} skip subnet{skipRows.length === 1 ? "" : "s"}</span>
          </span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="grid gap-4 border-t border-border px-3.5 py-3 lg:grid-cols-2">
          {/* Schedules */}
          <div>
            <h4 className="mb-2 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-foreground [&_svg]:size-3 [&_svg]:text-signal">
              <Repeat /> Recurring scans
            </h4>
            {scheduleRows.length === 0 ? (
              <p className="text-[11px] leading-snug text-[var(--text-dim)]">
                None yet. Pick a “Repeat” interval in the New Scan dialog to create one.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {scheduleRows.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 rounded-sm border border-border bg-secondary px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12px] text-foreground">
                        {s.label || s.cidr}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-[var(--text-dim)]">
                        {s.label ? `${s.cidr} · ` : ""}{humanInterval(s.intervalMinutes)} · next {nextRunLabel(s)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSchedule(s)}
                      title={s.enabled ? "Pause" : "Resume"}
                      className={`inline-flex size-6 items-center justify-center rounded-sm border ${s.enabled ? "border-signal text-signal" : "border-input text-[var(--text-dim)]"}`}
                    >
                      {s.enabled ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSchedule(s.id)}
                      title="Delete schedule"
                      className="inline-flex size-6 items-center justify-center rounded-sm border border-input text-[var(--text-dim)] hover:border-destructive hover:text-destructive"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Skip subnets */}
          <div>
            <h4 className="mb-2 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-foreground [&_svg]:size-3 [&_svg]:text-destructive">
              <Ban /> Skip subnets
            </h4>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <input
                value={skipCidr}
                onChange={(e) => setSkipCidr(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSkip()}
                placeholder="10.0.0.0/8 or 2001:db8::/32"
                className="min-w-[140px] flex-1 rounded-sm border border-input bg-secondary px-2 py-1 font-mono text-[11px] text-foreground"
              />
              <input
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSkip()}
                placeholder="reason (optional)"
                className="min-w-[100px] flex-1 rounded-sm border border-input bg-secondary px-2 py-1 text-[11px] text-foreground"
              />
              <button
                type="button"
                onClick={addSkip}
                className="inline-flex items-center gap-1 rounded-sm border border-input bg-secondary px-2 py-1 font-mono text-[11px] text-foreground hover:border-signal hover:text-signal"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            {skipErr && <p className="mb-1.5 text-[11px] text-destructive">{skipErr}</p>}
            {skipRows.length === 0 ? (
              <p className="text-[11px] leading-snug text-[var(--text-dim)]">
                No skip subnets. Scans that fall entirely inside a skip subnet are rejected; overlapping ranges skip those addresses.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {skipRows.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 rounded-sm border border-border bg-secondary px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12px] text-foreground">{s.cidr}</span>
                      {s.reason && (
                        <span className="block truncate text-[10px] text-[var(--text-dim)]">{s.reason}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteSkip(s.id)}
                      title="Remove from skip list"
                      className="inline-flex size-6 items-center justify-center rounded-sm border border-input text-[var(--text-dim)] hover:border-destructive hover:text-destructive"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
