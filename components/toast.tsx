"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";

type Toast = { id: number; message: string; kind: "success" | "error" };
type Listener = (t: Omit<Toast, "id">) => void;

let listener: Listener | null = null;
let nextId = 1;

/**
 * Fire an app-wide toast. Errors were previously swallowed silently in most
 * mutation handlers (pause/resume, deletes, label saves), leaving users to
 * guess whether anything happened. Usage: `toast.error("Delete failed")`.
 */
export const toast = {
  success(message: string) {
    listener?.({ message, kind: "success" });
  },
  error(message: string) {
    listener?.({ message, kind: "error" });
  },
};

/** Mount once (root layout) to render the toast stack. */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    listener = (t) => {
      const id = nextId++;
      setItems((prev) => [...prev.slice(-3), { ...t, id }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }, t.kind === "error" ? 6000 : 3500);
    };
    return () => {
      listener = null;
    };
  }, []);

  if (!items.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.kind === "success" ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
          <span className="toast-message">{t.message}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
