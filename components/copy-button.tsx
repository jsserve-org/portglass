"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small reusable copy-to-clipboard button. Shows a brief check on success and
 * silently no-ops if the clipboard API is unavailable (e.g. non-secure
 * context). Pass `label` to render text next to the icon.
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

  const onClick = async (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? "Copy to clipboard"}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-input bg-secondary px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:border-beam hover:text-beam",
        copied && "border-signal text-signal",
        className
      )}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
      {label && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}
