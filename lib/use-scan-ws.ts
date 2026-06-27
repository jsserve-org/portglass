import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Subscribe to one scan's live detail over the WebSocket (/api/ws/scans).
 *
 * Shares the same socket the scans list uses, but additionally sends
 * {type:'subscribe', runId}; the server then pushes {type:'scan', runId, data}
 * each tick. We write that into the ["scan", runId] React Query cache so the
 * scan-detail page (progress, current IP, and findings) renders straight from
 * the socket instead of polling. Returns whether the socket is connected so the
 * caller can disable its REST refetchInterval and fall back when it's down.
 */
export function useScanWs(runId: string | number): boolean {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("WebSocket" in window)) return;

    let ws: WebSocket | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws/scans`;

    const connect = () => {
      if (stopped) return;
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      ws.onopen = () => {
        setConnected(true);
        try {
          ws?.send(JSON.stringify({ type: "subscribe", runId }));
        } catch {
          /* will resubscribe on reconnect */
        }
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg?.type === "scan" && String(msg.runId) === String(runId)) {
            qc.setQueryData(["scan", String(runId)], msg.data);
          }
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(connect, 4000);
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* noop */
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      try {
        ws?.close();
      } catch {
        /* noop */
      }
    };
  }, [qc, runId]);

  return connected;
}
