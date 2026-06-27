// Tiny in-memory, bounded, TTL cache for hot read endpoints. Designed to cut
// repeated Postgres work (esp. the correlated geo/ASN inet-containment
// subqueries and the every-2s WebSocket /api/runs polls) without using much
// RAM: at most MAX_ENTRIES small JSON values, each expiring after a short TTL.
//
// It also de-duplicates concurrent identical computations (in-flight promise
// sharing), so N WebSocket clients ticking at the same instant collapse to a
// single DB query instead of N.

type Entry = { value: unknown; expires: number; inflight?: Promise<unknown> };

const MAX_ENTRIES = 500;
const store = new Map<string, Entry>();

/**
 * Return the cached value for `key`, or compute it with `fn`, cache it for
 * `ttlMs`, and return it. Concurrent calls for the same key while a computation
 * is in flight share that single promise.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  if (hit?.inflight) return hit.inflight as Promise<T>;

  const inflight = fn()
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      if (store.size > MAX_ENTRIES) {
        // Evict the oldest insertion (Map preserves insertion order).
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      return value;
    })
    .catch((err) => {
      store.delete(key);
      throw err;
    });

  // Keep any stale value around so concurrent callers can still be served the
  // in-flight promise; the entry is replaced on resolve.
  store.set(key, { value: hit?.value, expires: 0, inflight });
  return inflight as Promise<T>;
}

/** Drop every cache entry whose key starts with `prefix`. */
export function invalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
