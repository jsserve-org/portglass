import { QueryClient } from '@tanstack/react-query';

// Shared, tuned React Query client. Without these defaults every view refetched
// on each window focus and treated data as immediately stale, so navigating
// between pages flashed loading spinners and re-ran queries constantly — the
// main reason the app felt sluggish. Cached data is now served instantly while
// background polling keeps active scans fresh.
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
        placeholderData: (prev: unknown) => prev,
      },
    },
  });
}
