import { AppError } from "@/shared/errors/app-error"
import { parseLocationSuggestions, parsePlaceCandidateBatches } from "@/modules/geocoding/geocoding.schemas"
import { resolvePlace } from "@/modules/geocoding/resolve-place"
import type { GeocodePlaceQuery, GeocodePlacesQuery, SuggestLocationsInput } from "@/modules/geocoding/geocoding.types"
import { mapTilerProvider } from "@/modules/geocoding/providers/maptiler.provider"
import type { GeocodingProvider } from "@/modules/geocoding/providers/geocoding.provider"

const SUGGEST_LIMIT = 8

export function createGeocodingService(provider: GeocodingProvider = mapTilerProvider) {
  return {
    async suggestLocations(input: SuggestLocationsInput) {
      const suggestions = await provider.suggest({
        query: input.query,
        language: input.language,
        limit: SUGGEST_LIMIT,
      })
      const parsed = parseLocationSuggestions(suggestions)
      if (!parsed) {
        throw new AppError("Geocoding response is invalid", 502, "Geocoding is unavailable")
      }
      return parsed
    },

    async geocodePlaces(input: GeocodePlacesQuery) {
      if (input.places.length === 0) return []
      const batches = await provider.geocodePlaces(input)
      const parsed = parsePlaceCandidateBatches(batches)
      if (!parsed || parsed.length !== input.places.length) {
        throw new AppError("Geocoding response is invalid", 502, "Geocoding is unavailable")
      }
      return parsed.map((candidates, index) => resolvePlace(queryName(input.places[index]), candidates))
    },
  }
}

function queryName(place: GeocodePlaceQuery | undefined) {
  return place?.searchName?.trim() || place?.name || ""
}

export const geocodingService = createGeocodingService()
