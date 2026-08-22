"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query";

/**
 * One shared React Query client for the whole app, provided from the root
 * layout. Every page used to instantiate its own client, which fragmented the
 * cache: overlapping data (device-types on / and /devices, host data across
 * views) was refetched per page and six clients meant six sets of timers.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // useState keeps a single client per browser session (and avoids sharing one
  // between SSR requests) — the pattern recommended by the TanStack docs.
  const [queryClient] = useState(() => makeQueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
