"use client";

import { useEffect, useRef, useState } from "react";
import { Share2, X, Trash2, ExternalLink } from "lucide-react";
import CopyButton from "./copy-button";
import { toast } from "./toast";
import { fmtDate } from "@/lib/format";

type ShareRow = {
  token: string;
  kind: string;
  refId: string;
  title: string | null;
  expiresAt: string | null;
  revoked: boolean;
  hasPassword: boolean;
  createdAt: string;
};

/**
 * Create and manage public share links for a scan or host. Opens a modal that
 * mints an unguessable link (optional title, expiry, password) and lists the
 * existing links for this resource with revoke.
 */
export default function ShareButton({ kind, refId }: { kind: "scan" | "host"; refId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ShareRow[]>([]);
  const [title, setTitle] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("0");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const load = async () => {
    try {
      const r = await fetch("/api/share", { credentials: "include" });
      if (!r.ok) throw new Error(r.statusText || "Could not load share links");
      const all: ShareRow[] = await r.json();
      setRows(all.filter((s) => s.kind === kind && s.refId === refId && !s.revoked));
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message || "Could not load share links");
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const create = async () => {
    setCreating(true);
    setError(null);
    setJustCreated(null);
    try {
      const r = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind,
          refId,
          title: title.trim() || undefined,
          expiresInDays: Number(expiresInDays) || undefined,
          password: password || undefined,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Failed to create link");
      setJustCreated(origin + body.url);
      setTitle("");
      setPassword("");
      setExpiresInDays("0");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (token: string) => {
    if (!window.confirm("Revoke this share link? Anyone with the URL will lose access.")) return;
    setRevokingToken(token);
    try {
      const r = await fetch(`/api/share/${token}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Revoke failed");
      toast.success("Share link revoked");
      await load();
    } catch {
      toast.error("Couldn't revoke the link — it's still active, try again");
    } finally {
      setRevokingToken(null);
    }
  };

  // Dialog semantics: Escape closes, focus enters the dialog on open and
  // returns to the trigger on close.
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    cardRef.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [open]);

  return (
    <>
      <button className="danger-action-btn share-trigger" onClick={() => setOpen(true)} title="Create a shareable report link">
        <Share2 size={13} /> Share
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)} role="presentation">
          <div
            ref={cardRef}
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Share report"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3><Share2 size={16} /> Share {kind === "scan" ? "scan" : "host"} report</h3>
              <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close dialog"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p className="share-help">
                Creates a public, read-only snapshot of the current results at an unguessable link.
                The snapshot is frozen — later scans never change it.
              </p>

              {error && <div className="modal-error" role="alert">{error}</div>}
              {loadError && (
                <div className="modal-error" role="alert">
                  {loadError}{" "}
                  <button type="button" onClick={load} className="underline">Retry</button>
                </div>
              )}

              <label className="modal-label" htmlFor="share-title">Title (optional)</label>
              <input id="share-title" className="modal-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q2 perimeter report" />

              <div className="modal-row">
                <div style={{ flex: 1 }}>
                  <label className="modal-label-small" htmlFor="share-expires">Expires</label>
                  <select id="share-expires" className="modal-input" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)}>
                    <option value="0">Never</option>
                    <option value="1">1 day</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="modal-label-small" htmlFor="share-password">Password (optional)</label>
                  <input id="share-password" className="modal-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passphrase" autoComplete="new-password" />
                </div>
              </div>

              <button className="auth-btn share-create-btn" onClick={create} disabled={creating}>
                <Share2 size={14} /> {creating ? "Creating…" : "Create link"}
              </button>

              {justCreated && (
                <div className="share-created">
                  <span className="share-created-label">Link created</span>
                  <div className="share-created-row">
                    <code title={justCreated}>{justCreated}</code>
                    <CopyButton text={justCreated} label="Copy" />
                  </div>
                </div>
              )}

              {rows.length > 0 && (
                <div className="share-list">
                  <div className="share-list-title">Active links ({rows.length})</div>
                  {rows.map((s) => {
                    const url = origin + "/share/" + s.token;
                    return (
                      <div key={s.token} className="share-list-row">
                        <div className="share-list-info">
                          <a href={url} target="_blank" rel="noreferrer" className="share-list-link">
                            /share/{s.token.slice(0, 10)}… <ExternalLink size={11} />
                          </a>
                          <span className="share-list-meta">
                            {s.hasPassword ? "🔒 " : ""}
                            {s.expiresAt ? `expires ${fmtDate(s.expiresAt)}` : "no expiry"}
                          </span>
                        </div>
                        <div className="share-list-actions">
                          <CopyButton text={url} title="Copy link" />
                          <button
                            className="share-revoke"
                            onClick={() => revoke(s.token)}
                            disabled={revokingToken === s.token}
                            aria-label={`Revoke share link${s.title ? ` "${s.title}"` : ""}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
