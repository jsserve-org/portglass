import { useEffect, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * Subscribe to live scan status over WebSocket (/api/ws/scans) and write each
 * push into the given React Query cache key, so views render from the socket
 * instead of polling. Returns whether the socket is currently connected; callers
 * use that to disable their REST refetchInterval (and fall back to it when the
 * socket is down or blocked by a proxy).
 */
export function useScansWs(queryKey: QueryKey): boolean {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const keyStr = JSON.stringify(queryKey);

  useEffect(() => {
    if (typeof window === "undefined" || !("WebSocket" in window)) return;
    const key = JSON.parse(keyStr) as QueryKey;

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
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg?.type === "scans") qc.setQueryData(key, msg.data);
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
  }, [qc, keyStr]);

  return connected;
}
