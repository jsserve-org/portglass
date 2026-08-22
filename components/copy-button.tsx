"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Legacy fallback for non-secure contexts (http:// self-hosted deployments,
 * in-app webviews) where navigator.clipboard doesn't exist or is blocked.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to execCommand */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Small reusable copy-to-clipboard button. Shows a brief check on success and
 * a visible failure state if the clipboard is unavailable. Pass `label` to
 * render text next to the icon.
 */
export default function CopyButton({
  text,
  label,
  title,
  className,
  size = 12,
  stopPropagation = true,
}: {
  text: string;
  label?: string;
  title?: string;
  className?: string;
  size?: number;
  stopPropagation?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const onClick = async (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      // Visible, honest feedback instead of a silent no-op.
      setFailed(true);
      setTimeout(() => setFailed(false), 1800);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={failed ? "Copy failed — clipboard unavailable" : (title ?? "Copy to clipboard")}
      aria-label={label ? undefined : failed ? "Copy failed" : (title ?? "Copy to clipboard")}
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-input bg-secondary px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:border-beam hover:text-beam",
        copied && "border-signal text-signal",
        failed && "border-destructive text-destructive",
        className
      )}
    >
      {copied ? <Check size={size} /> : failed ? <X size={size} /> : <Copy size={size} />}
      {label && <span>{copied ? "Copied" : failed ? "Failed" : label}</span>}
    </button>
  );
}
