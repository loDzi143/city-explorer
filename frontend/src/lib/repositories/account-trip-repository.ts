import { api, failureCode, REPLY_TIMEOUT_MS } from "@/lib/api"
import type { Trip } from "@/types/chat"
import { parseTrip, parseTrips } from "@/utils/trip-codec"
import { unanswered } from "@/utils/trip-messages"

import type { TripReducer, TripRepository } from "./trip-repository"

function toTrip(data: unknown): Trip {
  const trip = parseTrip(data)
  if (!trip) throw new Error("Invalid trip in the API response")
  return trip
}

/**
 * Replaces the local trip with the server's copy unless the local copy already reflects a later
 * change (responses to concurrent requests may arrive out of order).
 */
function replaceWith(server: Trip): TripReducer {
  return (current) => {
    if (current.updatedAt && server.updatedAt && current.updatedAt > server.updatedAt) return current
    return server
  }
}

export async function fetchAccountTrips(): Promise<Trip[]> {
  const { data } = await api.get("/api/trips")
  if (!Array.isArray(data)) throw new Error("Invalid trips in the API response")
  return parseTrips(data)
}

export function createAccountTripRepository(): TripRepository {
  // Writes to one trip are sent one after another, and a reply waits for them, so the server
  // always answers the state the user sees (e.g. the trip exists before its settings are saved).
  const writes = new Map<string, Promise<unknown>>()

  function write<T>(tripId: string, request: () => Promise<T>): Promise<T> {
    const previous = writes.get(tripId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(request)
    writes.set(tripId, next)
    void next.finally(() => {
      if (writes.get(tripId) === next) writes.delete(tripId)
    }).catch(() => undefined)
    return next
  }

  function settled(tripId: string) {
    return (writes.get(tripId) ?? Promise.resolve()).catch(() => undefined)
  }

  return {
    mode: "account",

    createTrip(trip) {
      return write(trip.id, async () => {
        const { data } = await api.post("/api/trips", { id: trip.id, name: trip.name })
        return replaceWith(toTrip(data))
      })
    },

    renameTrip(trip) {
      return write(trip.id, async () => {
        const { data } = await api.patch(`/api/trips/${trip.id}`, { name: trip.name })
        return replaceWith(toTrip(data))
      })
    },

    saveTrip(trip) {
      return write(trip.id, async () => {
        const { start, end, hotel, prefs } = trip.details
        const { data } = await api.patch(`/api/trips/${trip.id}`, {
          ...(trip.place ? { place: trip.place } : {}),
          details: { start, end, hotel, prefs },
        })
        return replaceWith(toTrip(data))
      })
    },

    deleteTrip(id) {
      return write(id, async () => {
        try {
          await api.delete(`/api/trips/${id}`)
        } catch (error) {
          // Already gone, e.g. a retry after a lost response.
          if (failureCode(error) !== "trip_not_found") throw error
        }
      })
    },

    async requestReply(trip) {
      await settled(trip.id)
      const pending = unanswered(trip.messages ?? []).filter((message) => message.role === "user")
      // The user's messages carry their client ids, so resending after a failure stores them once.
      const { data } =
        pending.length > 0
          ? await api.post(`/api/trips/${trip.id}/messages`, { messages: pending.map(({ id, text }) => ({ id, text })) }, { timeout: REPLY_TIMEOUT_MS })
          : await api.post(`/api/trips/${trip.id}/reply`, undefined, { timeout: REPLY_TIMEOUT_MS })
      return replaceWith(toTrip(data))
    },

    async reloadTrip(id) {
      await settled(id)
      const { data } = await api.get(`/api/trips/${id}`)
      return replaceWith(toTrip(data))
    },
  }
}
