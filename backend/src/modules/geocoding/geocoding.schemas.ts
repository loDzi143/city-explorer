import { z } from "zod"

import { isLanguage } from "@/shared/types/language"

import type { LocationSuggestion, PlaceCandidate, SuggestLocationsInput } from "./geocoding.types"

export const suggestLocationsQuerySchema = z.object({
  query: z.string().trim().max(200),
  language: z
    .string()
    .optional()
    .transform((value) => (isLanguage(value) ? value : undefined)),
})

export const locationSuggestionSchema = z.object({
  id: z.string().min(1),
  city: z.string(),
  country: z.string(),
  countryCode: z.string().nullable(),
  longitude: z.number().finite(),
  latitude: z.number().finite(),
  bbox: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]).nullable(),
})

export function parseSuggestLocationsQuery(
  params: URLSearchParams,
): { ok: true; data: SuggestLocationsInput } | { ok: false; error: string } {
  const result = suggestLocationsQuerySchema.safeParse({
    query: params.get("query") ?? "",
    language: params.get("language") ?? undefined,
  })

  if (!result.success) {
    return { ok: false, error: "Query is too long" }
  }

  return { ok: true, data: result.data }
}

export function parseLocationSuggestions(payload: unknown): LocationSuggestion[] | null {
  const result = locationSuggestionSchema.array().safeParse(payload)
  return result.success ? result.data : null
}

const placeCandidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  longitude: z.number().finite(),
  latitude: z.number().finite(),
  relevance: z.number().finite(),
})

export function parsePlaceCandidateBatches(payload: unknown): PlaceCandidate[][] | null {
  const result = placeCandidateSchema.array().array().safeParse(payload)
  return result.success ? result.data : null
}
