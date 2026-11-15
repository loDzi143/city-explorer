import { z } from "zod"

import { isNearDestination } from "@/modules/ai/agents/place-check"
import type { ToolDefinition } from "@/modules/ai/llm/chat.types"
import { geocodingService } from "@/modules/geocoding/geocoding.service"
import type { ResolvedPlace } from "@/modules/geocoding/geocoding.types"
import { AppError } from "@/shared/errors/app-error"

const MAX_PLACES = 200
const MAX_ARGUMENTS = 20_000
const INVALID_ARGUMENTS = "Invalid geocode_places arguments"

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

  let matches: ResolvedPlace[]
  try {
    matches = await geocodingService.geocodePlaces({
      places: payload.data.places.map((place) => ({
        name: place.name,
        ...(place.searchName ? { searchName: place.searchName } : {}),
      })),
      city: destination.city,
      country: destination.country,
      latitude: destination.latitude,
      longitude: destination.longitude,
    })
  } catch (error) {
    // The geocoder refused these names (not an outage): the model can rephrase, the user can't.
    if (error instanceof AppError && error.status === 400) return { error: INVALID_ARGUMENTS }
    throw error
  }

  return payload.data.places.map((place, index) => toGeocodedPlace(place, nearDestination(matches[index], destination)))
}

/** A match far from the destination is another place with the same name, not the one that was asked for. */
function nearDestination(match: ResolvedPlace | undefined, destination: GeocodeDestination): ResolvedPlace | undefined {
  if (match?.status !== "found" || isNearDestination(match.coordinates, destination)) return match
  return { status: "not_found" }
}

function parseToolInput(input: unknown): { ok: true; data: GeocodePlacesInput } | { ok: false; error: string } {
  let payload = input
  if (typeof input === "string") {
    if (input.length > MAX_ARGUMENTS) return { ok: false, error: INVALID_ARGUMENTS }
    try {
      payload = JSON.parse(input)
    } catch {
      return { ok: false, error: INVALID_ARGUMENTS }
    }
  }

  const parsed = geocodePlacesInputSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: INVALID_ARGUMENTS }
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
