"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useLiveSocket } from "./use-live-socket";

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

  const connected = useLiveSocket({
    onMessage: (msg) => {
      if (msg?.type === "scan" && String(msg.runId) === String(runId)) {
        qc.setQueryData(["scan", String(runId)], msg.data);
      }
    },
    onOpen: (send) => send(JSON.stringify({ type: "subscribe", runId })),
  });

  return connected;
}
