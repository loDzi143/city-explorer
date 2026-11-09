import type { Language } from "@/shared/types/language"

export type LocationSuggestion = {
  id: string
  city: string
  country: string
  countryCode: string | null
  longitude: number
  latitude: number
  bbox: [number, number, number, number] | null
}

export type SuggestLocationsInput = {
  query: string
  language?: Language
}

export type PlaceCandidate = {
  id: string
  name: string
  longitude: number
  latitude: number
  relevance: number
}

export type GeocodePlaceQuery = {
  name: string
  searchName?: string
}

export type GeocodePlacesQuery = {
  places: GeocodePlaceQuery[]
  city: string
  country: string
  latitude: number
  longitude: number
}

export type ResolvedPlace =
  | {
      status: "found"
      id: string
      matchedName: string
      coordinates: {
        latitude: number
        longitude: number
      }
    }
  | {
      status: "not_found" | "ambiguous"
    }
