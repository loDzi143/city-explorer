import { beforeEach, describe, expect, it, vi } from "vitest"

import { createBrowser } from "@/app/api/_lib/testing"
import { GET as suggest } from "@/app/api/locations/suggest/route"
import { AppError } from "@/shared/errors/app-error"

const maptiler = vi.hoisted(() => ({
  suggest: vi.fn(),
}))

vi.mock("@/modules/geocoding/providers/maptiler.provider", () => ({
  mapTilerProvider: { suggest: maptiler.suggest, geocodePlaces: async () => [] },
}))

const lisbon = { id: "place.1", city: "Lisbon", country: "Portugal", countryCode: "pt", longitude: -9.1393, latitude: 38.7223, bbox: null }

function search(browser: ReturnType<typeof createBrowser>, query: string) {
  return browser.call(suggest, { path: `/api/locations/suggest?${new URLSearchParams({ query, language: "en" })}` })
}

beforeEach(() => {
  maptiler.suggest.mockReset()
})

describe("city suggestions", () => {
  it("returns the provider's cities", async () => {
    maptiler.suggest.mockResolvedValue([lisbon])
    const result = await search(createBrowser(), "Lis")

    expect(result.status).toBe(200)
    expect(result.body).toEqual([lisbon])
    expect(maptiler.suggest).toHaveBeenCalledWith({ query: "Lis", language: "en", limit: 8 })
  })

  it("answers an empty query without calling the provider and rejects an overlong one", async () => {
    const browser = createBrowser()
    expect((await search(browser, "  ")).body).toEqual([])
    expect((await search(browser, "x".repeat(201))).status).toBe(400)
    expect(maptiler.suggest).not.toHaveBeenCalled()
  })

  it("reports a provider failure or a malformed answer without its details", async () => {
    maptiler.suggest.mockRejectedValueOnce(new AppError("MapTiler geocoding request failed: key=secret", 502, "Geocoding is unavailable", "geocoding_unavailable"))
    const failed = await search(createBrowser(), "Lis")
    expect(failed.status).toBe(502)
    expect(failed.body).toEqual({ error: "Geocoding is unavailable", code: "geocoding_unavailable" })

    maptiler.suggest.mockResolvedValueOnce([{ id: "place.1", city: "Lisbon" }])
    expect((await search(createBrowser(), "Lis")).status).toBe(502)

    maptiler.suggest.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined"))
    expect((await search(createBrowser(), "Lis")).body).toEqual({ error: "Geocoding is unavailable", code: "geocoding_unavailable" })
  })

  it("limits lookups from one address", async () => {
    maptiler.suggest.mockResolvedValue([])
    const browser = createBrowser()
    for (let request = 0; request < 180; request += 1) await search(browser, "Lis")

    const limited = await search(browser, "Lis")
    expect(limited.status).toBe(429)
    expect(maptiler.suggest).toHaveBeenCalledTimes(180)
  })
})
