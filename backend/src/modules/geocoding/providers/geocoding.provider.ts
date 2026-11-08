import type { Language } from "@/shared/types/language"
import type { LocationSuggestion } from "@/modules/geocoding/geocoding.types"

export type GeocodingSearch = {
  query: string
  language?: Language
  limit: number
}

export interface GeocodingProvider {
  suggest(search: GeocodingSearch): Promise<LocationSuggestion[]>
}
