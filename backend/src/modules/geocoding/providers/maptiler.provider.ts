import { readEnv } from "@/config/env"
import { AppError } from "@/shared/errors/app-error"
import type { GeocodingProvider } from "@/modules/geocoding/providers/geocoding.provider"
import type { GeocodePlaceQuery, GeocodePlacesQuery, LocationSuggestion, PlaceCandidate } from "@/modules/geocoding/geocoding.types"

const PLACE_LIMIT = 3
const PLACE_BATCH_SIZE = 50
const PLACE_QUERY_LENGTH = 400

const CITY_TYPES = [
  "region",
  "subregion",
  "county",
  "municipality",
  "joint_municipality",
  "municipal_district",
  "locality",
  "place",
]
const CITY_DESIGNATIONS = new Set(["city", "town"])
const MUNICIPAL_TYPES = new Set(["municipality", "joint_municipality", "municipal_district"])

export const mapTilerProvider: GeocodingProvider = {
  async suggest(search) {
    const { key, geocodingUrl } = mapTilerConfig()
    const url = new URL(`${geocodingUrl}/${encodeURIComponent(search.query)}.json`)
    url.searchParams.set("key", key)
    url.searchParams.set("limit", String(search.limit))
    url.searchParams.set("autocomplete", "true")
    url.searchParams.set("types", CITY_TYPES.join(","))
    if (search.language) url.searchParams.set("language", search.language)

    return toSuggestions(await mapTilerJson(url, 10_000))
  },

  async geocodePlaces(query) {
    if (query.places.length === 0) return []

    const { key, geocodingUrl } = mapTilerConfig()
    const queries = query.places.map((place) => placeQuery(queryName(place), query.city, query.country))
    const batches: PlaceCandidate[][] = []

    for (let index = 0; index < queries.length; index += PLACE_BATCH_SIZE) {
      const chunk = queries.slice(index, index + PLACE_BATCH_SIZE)
      const payload = await mapTilerJson(placeBatchUrl(geocodingUrl, key, chunk, query), 15_000)
      const candidates = placeBatches(payload, chunk.length)
      if (!candidates) {
        throw new AppError("MapTiler geocoding response is invalid", 502, "Geocoding is unavailable")
      }
      batches.push(...candidates)
    }

    return batches
  },
}

function mapTilerConfig() {
  const { MAPTILER_KEY: key, GEOCODING_URL: geocodingUrl } = readEnv()
  if (!key) {
    throw new AppError("MAPTILER_KEY is not configured", 502, "Geocoding is unavailable")
  }
  if (!geocodingUrl) {
    throw new AppError("GEOCODING_URL is not configured", 502, "Geocoding is unavailable")
  }
  return { key, geocodingUrl }
}

async function mapTilerJson(url: URL, timeout: number) {
  let response: Response
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeout) })
  } catch {
    throw new AppError("MapTiler geocoding request failed", 502, "Geocoding is unavailable")
  }

  if (!response.ok) {
    const status = response.status === 400 ? 400 : 502
    throw new AppError("MapTiler geocoding request failed", status, "Geocoding is unavailable")
  }

  try {
    return await response.json()
  } catch {
    throw new AppError("MapTiler geocoding response is invalid", 502, "Geocoding is unavailable")
  }
}

function queryName(place: GeocodePlaceQuery) {
  return place.searchName?.trim() || place.name
}

function placeQuery(name: string, city: string, country: string) {
  return [name, city, country]
    .map((part) => part.replace(/;/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ")
    .slice(0, PLACE_QUERY_LENGTH)
}

function placeBatchUrl(geocodingUrl: string, key: string, queries: string[], query: GeocodePlacesQuery) {
  const path = queries.map((item) => encodeURIComponent(item)).join(";")
  const url = new URL(`${geocodingUrl}/${path}.json`)
  url.searchParams.set("key", key)
  url.searchParams.set("types", "poi")
  url.searchParams.set("limit", String(PLACE_LIMIT))
  url.searchParams.set("proximity", `${query.longitude},${query.latitude}`)
  url.searchParams.set("language", "en")
  url.searchParams.set("autocomplete", "false")
  return url
}

function placeBatches(payload: unknown, count: number): PlaceCandidate[][] | null {
  const collections = Array.isArray(payload) ? payload : count === 1 ? [payload] : null
  if (!collections || collections.length !== count) return null

  const batches: PlaceCandidate[][] = []
  for (const collection of collections) {
    const candidates = placeCandidates(collection)
    if (!candidates) return null
    batches.push(candidates)
  }
  return batches
}

function placeCandidates(collection: unknown): PlaceCandidate[] | null {
  if (!isRecord(collection) || !Array.isArray(collection.features)) return null

  const candidates: PlaceCandidate[] = []
  const seen = new Set<string>()
  for (const feature of collection.features) {
    const candidate = placeCandidate(feature)
    if (!candidate || seen.has(candidate.id)) continue
    seen.add(candidate.id)
    candidates.push(candidate)
  }
  return candidates.slice(0, PLACE_LIMIT)
}

function placeCandidate(feature: unknown): PlaceCandidate | null {
  if (!isRecord(feature)) return null
  const id = typeof feature.id === "string" ? feature.id.trim() : ""
  const name = placeName(feature)
  const center = coordinatePair(feature.center) ?? coordinatePair(isRecord(feature.geometry) ? feature.geometry.coordinates : null)
  const relevance = typeof feature.relevance === "number" && Number.isFinite(feature.relevance) ? feature.relevance : 0
  if (!id || !name || !center) return null
  return {
    id,
    name,
    longitude: center[0],
    latitude: center[1],
    relevance,
  }
}

function placeName(feature: Record<string, unknown>) {
  if (typeof feature.text === "string" && feature.text.trim()) return feature.text.trim()
  if (typeof feature.place_name !== "string") return ""
  return feature.place_name.split(",")[0]?.trim() ?? ""
}

function toSuggestions(payload: unknown): LocationSuggestion[] {
  if (!isRecord(payload) || !Array.isArray(payload.features)) return []

  const suggestions: LocationSuggestion[] = []
  const seen = new Set<string>()

  for (const feature of payload.features) {
    const suggestion = toSuggestion(feature)
    if (!suggestion || seen.has(suggestion.id)) continue
    seen.add(suggestion.id)
    suggestions.push(suggestion)
  }

  return suggestions
}

function toSuggestion(feature: unknown): LocationSuggestion | null {
  if (!isRecord(feature) || !isCityFeature(feature)) return null

  const id = typeof feature.id === "string" ? feature.id : ""
  const city = typeof feature.text === "string" ? feature.text.trim() : ""
  const center = coordinatePair(feature.center) ?? coordinatePair(isRecord(feature.geometry) ? feature.geometry.coordinates : null)
  if (!id || !city || !center) return null

  const { country, countryCode } = countryOf(feature)

  return {
    id,
    city,
    country,
    countryCode,
    longitude: center[0],
    latitude: center[1],
    bbox: cityBbox(feature.bbox),
  }
}

function isCityFeature(feature: Record<string, unknown>) {
  const properties = isRecord(feature.properties) ? feature.properties : {}
  const designation = typeof properties.place_designation === "string" ? properties.place_designation : ""
  if (CITY_DESIGNATIONS.has(designation)) return true
  const placeType = Array.isArray(feature.place_type) ? feature.place_type.find((type) => typeof type === "string") : null
  return !designation && typeof placeType === "string" && MUNICIPAL_TYPES.has(placeType)
}

function countryOf(feature: Record<string, unknown>) {
  const properties = isRecord(feature.properties) ? feature.properties : {}
  let countryCode = typeof properties.country_code === "string" ? properties.country_code : null
  let country = ""

  if (Array.isArray(feature.context)) {
    for (const item of feature.context) {
      if (!isRecord(item) || typeof item.id !== "string" || !item.id.startsWith("country.")) continue
      if (typeof item.text === "string") country = item.text.trim()
      if (!countryCode && typeof item.country_code === "string") countryCode = item.country_code
      break
    }
  }

  if (!country && typeof feature.place_name === "string") {
    const parts = feature.place_name
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length > 1) country = parts[parts.length - 1] ?? ""
  }

  return { country, countryCode }
}

function coordinatePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const longitude = value[0]
  const latitude = value[1]
  if (typeof longitude !== "number" || typeof latitude !== "number") return null
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return [longitude, latitude]
}

function bboxOf(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length < 4) return null
  const coords = value.slice(0, 4)
  if (!coords.every((coord): coord is number => typeof coord === "number" && Number.isFinite(coord))) return null
  return [coords[0], coords[1], coords[2], coords[3]]
}

function cityBbox(value: unknown): [number, number, number, number] | null {
  const bbox = bboxOf(value)
  if (!bbox) return null
  const width = Math.abs(bbox[2] - bbox[0])
  const height = Math.abs(bbox[3] - bbox[1])
  if (width < 0.02 && height < 0.02) return null
  if (width > 4 || height > 4) return null
  return bbox
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
