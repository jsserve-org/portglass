"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useLiveSocket } from "./use-live-socket";

/**
 * Subscribe to live scan status over WebSocket (/api/ws/scans) and write each
 * push into the given React Query cache key, so views render from the socket
 * instead of polling. Returns whether the socket is currently connected; callers
 * use that to disable their REST refetchInterval (and fall back to it when the
 * socket is down or blocked by a proxy).
 */
export function useScansWs(queryKey: QueryKey): boolean {
  const qc = useQueryClient();
  const keyStr = JSON.stringify(queryKey);

  const connected = useLiveSocket({
    onMessage: (msg) => {
      if (msg?.type === "scans") qc.setQueryData(JSON.parse(keyStr) as QueryKey, msg.data);
    },
  });

  return connected;
}
