import { AppError } from "@/shared/errors/app-error"
import { parseLocationSuggestions } from "@/modules/geocoding/geocoding.schemas"
import type { SuggestLocationsInput } from "@/modules/geocoding/geocoding.types"
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
  }
}

export const geocodingService = createGeocodingService()
