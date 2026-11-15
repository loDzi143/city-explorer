type Bucket = { count: number; resetAt: number }

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

export type RateLimiter = {
  /** Counts one attempt for the key. */
  hit(key: string): RateLimitResult
  /** Forgets the key, e.g. after a successful login. */
  reset(key: string): void
}

const MAX_KEYS = 50_000

/**
 * Fixed-window counter kept in process memory. Good enough for a single backend instance;
 * several instances would need a shared store (PostgreSQL or Redis) behind the same interface.
 */
export function createMemoryRateLimiter(options: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const buckets = new Map<string, Bucket>()
  const now = options.now ?? Date.now

  function sweep(time: number) {
    if (buckets.size < MAX_KEYS) return
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= time) buckets.delete(key)
    }
    // Still full: drop the oldest entries rather than grow without bound.
    for (const key of buckets.keys()) {
      if (buckets.size < MAX_KEYS) break
      buckets.delete(key)
    }
  }

  return {
    hit(key) {
      const time = now()
      const bucket = buckets.get(key)
      if (!bucket || bucket.resetAt <= time) {
        sweep(time)
        buckets.set(key, { count: 1, resetAt: time + options.windowMs })
        return { allowed: true }
      }
      bucket.count += 1
      if (bucket.count <= options.limit) return { allowed: true }
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - time) / 1000)) }
    },
    reset(key) {
      buckets.delete(key)
    },
  }
}
