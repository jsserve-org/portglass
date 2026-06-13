"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { suggestCommands } from "@/lib/commands";
import { cn } from "@/lib/utils";

/**
 * A compact "Tools" button that opens a popover of ready-to-run commands for a
 * finding (sqlmap, curl, nmap, db clients, …). Each row copies to the clipboard
 * on click. Nothing is executed — these are for authorized testing by hand.
 */
export default function CommandMenu({
  ip,
  port,
  service,
}: {
  ip: string;
  port: number;
  service?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const commands = suggestCommands(ip, port, service);

  // Anchor the menu with fixed positioning so it escapes the findings table's
  // overflow:auto clip. Recompute on open and while scrolling/resizing.
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const reposition = () => place();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const copy = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      setTimeout(() => setCopied((c) => (c === cmd ? null : c)), 1500);
    } catch {
      /* clipboard blocked (e.g. non-secure context); ignore */
    }
  };

  return (
    <div ref={ref} className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm border border-input bg-secondary px-2 py-1 font-mono text-[11px] text-foreground hover:border-beam hover:text-beam",
          open && "border-beam text-beam"
        )}
        title="Copy a tool command for this service"
      >
        <Terminal size={12} /> Tools
      </button>
      {open && pos && (
        <div
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-50 w-[340px] max-w-[80vw] overflow-hidden rounded-md border border-input bg-popover shadow-lg"
        >
          {commands.map((c) => {
            const isCopied = copied === c.cmd;
            return (
              <button
                key={c.label}
                type="button"
                onClick={() => copy(c.cmd)}
                className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-secondary"
              >
                <span className="w-[88px] shrink-0 font-mono text-[10px] uppercase tracking-wide text-signal">
                  {c.label}
                </span>
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                  {c.cmd}
                </code>
                {isCopied ? (
                  <Check size={13} className="shrink-0 text-signal" />
                ) : (
                  <Copy size={13} className="shrink-0 text-[var(--text-dim)]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
