import { describe, expect, it } from "vitest"

import type { PlaceCandidate } from "@/modules/geocoding/geocoding.types"
import { resolvePlace } from "@/modules/geocoding/resolve-place"

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return { id: "poi.1", name: "Gyeongbokgung", longitude: 126.977, latitude: 37.5796, relevance: 1, ...overrides }
}

describe("resolvePlace", () => {
  it("finds a single confident match", () => {
    expect(resolvePlace("Gyeongbokgung", [candidate()])).toEqual({
      status: "found",
      id: "poi.1",
      matchedName: "Gyeongbokgung",
      coordinates: { latitude: 37.5796, longitude: 126.977 },
    })
  })

  it("reports nothing found without a confident candidate", () => {
    expect(resolvePlace("Gyeongbokgung", [])).toEqual({ status: "not_found" })
    expect(resolvePlace("Gyeongbokgung", [candidate({ relevance: 0.7 })])).toEqual({ status: "not_found" })
  })

  it("prefers the candidate whose name matches, ignoring case and accents", () => {
    const result = resolvePlace("sagrada familia", [
      candidate({ id: "poi.cafe", name: "Café Central", relevance: 1 }),
      candidate({ id: "poi.church", name: "Sagrada Família", relevance: 0.95 }),
    ])
    expect(result).toMatchObject({ status: "found", id: "poi.church" })
  })

  it("does not pick between two equally good different places", () => {
    const result = resolvePlace("Starbucks", [
      candidate({ id: "poi.a", name: "Starbucks", latitude: 37.5, longitude: 127.0 }),
      candidate({ id: "poi.b", name: "Starbucks", latitude: 37.6, longitude: 126.9, relevance: 0.97 }),
    ])
    expect(result).toEqual({ status: "ambiguous" })
  })

  it("treats entries of the same place as one", () => {
    const result = resolvePlace("Gyeongbokgung", [
      candidate(),
      candidate({ id: "poi.2", latitude: 37.5797, longitude: 126.9771, relevance: 0.99 }),
      candidate({ relevance: 0.98 }),
    ])
    expect(result).toMatchObject({ status: "found", id: "poi.1" })
  })

  it("ignores a rival below the confidence threshold", () => {
    const result = resolvePlace("Gyeongbokgung", [candidate(), candidate({ id: "poi.far", latitude: 35.1, longitude: 129.0, relevance: 0.89 })])
    expect(result).toMatchObject({ status: "found", id: "poi.1" })
  })

  it("does not choose when a second confident candidate is a different place", () => {
    const result = resolvePlace("Gyeongbokgung", [candidate(), candidate({ id: "poi.far", latitude: 35.1, longitude: 129.0, relevance: 0.91 })])
    expect(result).toEqual({ status: "ambiguous" })
  })
})
