import { z } from "zod"

import { geocodingService } from "@/modules/geocoding/geocoding.service"
import type { ResolvedPlace } from "@/modules/geocoding/geocoding.types"
import type { ToolDefinition } from "@/modules/ai/llm/chat.types"

const MAX_PLACES = 200
const MAX_ARGUMENTS = 20_000

const dayIndexSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/).transform(Number),
])

const optionalSearchName = z.preprocess(
  (value) => (value === null || value === undefined ? undefined : typeof value === "string" ? value.trim() || undefined : value),
  z.string().min(1).max(300).optional(),
)

const geocodePlacesInputSchema = z.object({
  places: z
    .array(
      z.object({
        dayIndex: dayIndexSchema,
        name: z.string().trim().min(1).max(300),
        searchName: optionalSearchName,
      }),
    )
    .max(MAX_PLACES),
})

export type GeocodePlacesInput = z.infer<typeof geocodePlacesInputSchema>

export type GeocodeDestination = {
  city: string
  country: string
  latitude: number
  longitude: number
}

export type GeocodedPlace =
  | {
      id: string
      dayIndex: number
      requestedName: string
      status: "found"
      matchedName: string
      coordinates: {
        latitude: number
        longitude: number
      }
    }
  | {
      dayIndex: number
      requestedName: string
      status: "not_found" | "ambiguous"
    }

export const geocodePlacesTool = {
  name: "geocode_places",
  description:
    "Resolve stable ids and coordinates for new itinerary places in the current destination. Pass every new place in one call, with a zero-based dayIndex, the display name, and an optional searchName in the local language. Do not call this for places that already have an id.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      places: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            dayIndex: { type: "integer", minimum: 0 },
            name: { type: "string" },
            searchName: { type: "string" },
          },
          required: ["dayIndex", "name"],
        },
      },
    },
    required: ["places"],
  },
} satisfies ToolDefinition

export async function executeGeocodePlaces(
  input: unknown,
  destination: GeocodeDestination,
): Promise<GeocodedPlace[] | { error: string }> {
  const payload = parseToolInput(input)
  if (!payload.ok) return { error: payload.error }

  const matches = await geocodingService.geocodePlaces({
    places: payload.data.places.map((place) => ({
      name: place.name,
      ...(place.searchName ? { searchName: place.searchName } : {}),
    })),
    city: destination.city,
    country: destination.country,
    latitude: destination.latitude,
    longitude: destination.longitude,
  })

  return payload.data.places.map((place, index) => toGeocodedPlace(place, matches[index]))
}

function parseToolInput(input: unknown): { ok: true; data: GeocodePlacesInput } | { ok: false; error: string } {
  let payload = input
  if (typeof input === "string") {
    if (input.length > MAX_ARGUMENTS) return { ok: false, error: "Invalid geocode_places arguments" }
    try {
      payload = JSON.parse(input)
    } catch {
      return { ok: false, error: "Invalid geocode_places arguments" }
    }
  }

  const parsed = geocodePlacesInputSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: "Invalid geocode_places arguments" }
  return { ok: true, data: parsed.data }
}

function toGeocodedPlace(place: GeocodePlacesInput["places"][number], match: ResolvedPlace | undefined): GeocodedPlace {
  if (!match || match.status !== "found") {
    return {
      dayIndex: place.dayIndex,
      requestedName: place.name,
      status: match?.status ?? "not_found",
    }
  }

  return {
    id: match.id,
    dayIndex: place.dayIndex,
    requestedName: place.name,
    status: "found",
    matchedName: match.matchedName,
    coordinates: match.coordinates,
  }
}
