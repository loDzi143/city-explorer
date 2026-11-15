import { describe, expect, it } from "vitest"

import { createMemoryRateLimiter } from "@/infrastructure/cache/rate-limiter"

describe("memory rate limiter", () => {
  it("allows the limit within a window and reports when to retry", () => {
    let time = 1_000
    const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 10_000, now: () => time })

    expect(limiter.hit("a")).toEqual({ allowed: true })
    expect(limiter.hit("a")).toEqual({ allowed: true })
    time += 4_000
    expect(limiter.hit("a")).toEqual({ allowed: false, retryAfterSeconds: 6 })
    // Another key has its own budget.
    expect(limiter.hit("b")).toEqual({ allowed: true })
  })

  it("starts a new window after the old one ends and forgets a reset key", () => {
    let time = 0
    const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 1_000, now: () => time })

    limiter.hit("a")
    expect(limiter.hit("a").allowed).toBe(false)
    time = 1_000
    expect(limiter.hit("a").allowed).toBe(true)

    expect(limiter.hit("a").allowed).toBe(false)
    limiter.reset("a")
    expect(limiter.hit("a").allowed).toBe(true)
  })
})
