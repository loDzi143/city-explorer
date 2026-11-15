// Budgets for routes that spend money or quota upstream (the model, the geocoder) or write a lot.
// Sign-in and registration are limited inside the account service, next to the credential checks.
import { createMemoryRateLimiter, type RateLimiter } from "@/infrastructure/cache/rate-limiter"
import { RateLimitError } from "@/shared/errors/rate-limit-error"

const MINUTE = 60_000

const limiters = {
  /** Guest replies from one address. */
  guestChat: createMemoryRateLimiter({ limit: 30, windowMs: 10 * MINUTE }),
  /**
   * Guest replies from everyone. The client address comes from X-Forwarded-For, which a direct client
   * can forge, so the per-address budget alone would not cap what an anonymous caller can spend.
   */
  guestChatTotal: createMemoryRateLimiter({ limit: 600, windowMs: 10 * MINUTE }),
  /** Model replies requested by one account. */
  tripReply: createMemoryRateLimiter({ limit: 60, windowMs: 10 * MINUTE }),
  /** City autocomplete from one address; the form asks at most a few times per second while typing. */
  suggestLocations: createMemoryRateLimiter({ limit: 180, windowMs: MINUTE }),
  /** Guest data imports by one account: each may carry megabytes. */
  importGuestData: createMemoryRateLimiter({ limit: 20, windowMs: 60 * MINUTE }),
} satisfies Record<string, RateLimiter>

export type RateLimitName = keyof typeof limiters

/** Counts one request against the budget; throws a 429 with Retry-After when it is spent. */
export function enforceRateLimit(name: RateLimitName, key: string) {
  const result = limiters[name].hit(key)
  if (!result.allowed) throw new RateLimitError(`Rate limit exceeded for ${name}`, result.retryAfterSeconds)
}
