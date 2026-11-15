import { distanceMeters, type Coordinates } from "@/shared/lib/geo"

import type { ItineraryDay, ItineraryPlace } from "./agent.types"

/**
 * Farthest a place may be from the destination. Wide enough for a long day trip, narrow enough to
 * reject coordinates in another country, swapped latitude and longitude, or 0,0.
 */
export const MAX_DISTANCE_FROM_DESTINATION_METERS = 500_000

export function isNearDestination(place: Coordinates, destination: Coordinates) {
  return distanceMeters(place, destination) <= MAX_DISTANCE_FROM_DESTINATION_METERS
}

/**
 * Checks the places of a model reply against what the server knows.
 *
 * `known` maps place ids to coordinates from the saved plan and from this reply's geocoding results.
 * The model is told to copy them, but it retypes numbers: a known place always gets the stored
 * coordinates back. A place with an id the server has never issued has no source for its position,
 * so it is kept only when it lies plausibly close to the destination.
 */
export function verifyItineraryPlaces(
  days: ItineraryDay[],
  known: ReadonlyMap<string, Coordinates>,
  destination: Coordinates,
): { days: ItineraryDay[]; rejected: ItineraryPlace[] } {
  const rejected: ItineraryPlace[] = []
  const checked = days.map((day) => ({
    date: day.date,
    places: day.places.flatMap((place): ItineraryPlace[] => {
      const coordinates = known.get(place.id)
      if (coordinates) return [{ ...place, coordinates: { latitude: coordinates.latitude, longitude: coordinates.longitude } }]
      if (isNearDestination(place.coordinates, destination)) return [place]
      rejected.push(place)
      return []
    }),
  }))
  return { days: checked, rejected }
}
