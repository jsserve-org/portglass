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
    // Escape closes and returns focus to the trigger; the menu previously had
    // no keyboard exit at all.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    // Coalesce repositions to one layout read per frame — the capture-phase
    // scroll listener previously measured on every scroll event.
    let raf = 0;
    const reposition = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        place();
      });
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
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
      setCopied(null);
    }
  };

  return (
    <div ref={ref} className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
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
          role="menu"
          aria-label="Tool commands"
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
