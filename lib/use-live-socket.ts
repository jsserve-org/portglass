"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared live-socket plumbing for /api/ws/scans: one socket per consumer with
 * exponential-backoff reconnects (1s doubling to a 30s cap, ±30% jitter) and
 * visibility gating.
 *
 * The old fixed 4s retry made every connected client hammer the server in
 * lock-step forever while it was down (thundering herd after each deploy), and
 * sockets kept streaming full payloads into hidden tabs. Now backoff spreads
 * retries out, a successful open resets the schedule, and hiding the tab
 * closes the socket (one REST refetch resyncs on return).
 */
export function useLiveSocket(opts: {
  onMessage: (msg: any) => void;
  /** Called on every (re)open with a send helper, e.g. to (re)subscribe. */
  onOpen?: (send: (raw: string) => void) => void;
}): boolean {
  const [connected, setConnected] = useState(false);
  // Handlers live in a ref so consumers can pass inline closures without
  // tearing down the socket on every render.
  const handlers = useRef(opts);
  handlers.current = opts;

  useEffect(() => {
    if (typeof window === "undefined" || !("WebSocket" in window)) return;

    let ws: WebSocket | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws/scans`;
    const send = (raw: string) => {
      try { ws?.send(raw); } catch { /* closing; resubscribes on reconnect */ }
    };

    const scheduleReconnect = () => {
      if (stopped || document.hidden || retry) return; // resume via visibilitychange
      const base = Math.min(30_000, 1000 * 2 ** attempt);
      const delay = base * (0.7 + Math.random() * 0.6);
      retry = setTimeout(() => {
        retry = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (stopped) return;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        handlers.current.onOpen?.(send);
      };
      ws.onmessage = (e) => {
        try {
          handlers.current.onMessage(JSON.parse(e.data));
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        attempt += 1;
        scheduleReconnect();
      };
      ws.onerror = () => {
        try { ws?.close(); } catch { /* noop */ }
      };
    };

    const onVisibility = () => {
      if (stopped) return;
      if (document.hidden) {
        // Background tabs don't need live frames; drop the socket entirely.
        if (retry) {
          clearTimeout(retry);
          retry = undefined;
        }
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          try { ws.close(); } catch { /* noop */ }
        }
      } else if ((!ws || ws.readyState === WebSocket.CLOSED) && !retry) {
        // A CLOSING socket's onclose handler reschedules once visible.
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    if (!document.hidden) connect();

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (retry) clearTimeout(retry);
      try { ws?.close(); } catch { /* noop */ }
    };
  }, []);

  return connected;
}
