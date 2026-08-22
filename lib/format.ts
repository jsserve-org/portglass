// Shared date/number formatting helpers. Formatting used to happen inline with
// `new Date(...).toLocaleXxx(...)` per row per render — each call parses the
// string and constructs a fresh Intl formatter. These module-level formatters
// are created once and reused, and relative times make recency readable at a
// glance in a monitoring tool ("3m ago" vs "Mar 4").

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** Absolute timestamp for titles/aria: localized date + time. */
export function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** Localized date only (no forced en-US). */
export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

/**
 * Coarse relative time: "just now", "5m ago", "3h ago", "2d ago"; older than
 * ~30 days falls back to the localized date.
 */
export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return "—";
  const diffSec = Math.round((ms - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return "just now";
  if (abs < 45 * 60) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 22 * 3600) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 30 * 86400) return rtf.format(Math.round(diffSec / 86400), "day");
  return fmtDate(d);
}

/** Copy-pasteable props for a <time> element: relative text + absolute title. */
export function timeProps(iso: string | Date | null | undefined) {
  const d = iso instanceof Date ? iso : iso ? new Date(iso) : null;
  return {
    dateTime: d && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined,
    title: fmtDateTime(d),
  };
}
