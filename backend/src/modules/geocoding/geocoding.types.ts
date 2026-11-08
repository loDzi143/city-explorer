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
