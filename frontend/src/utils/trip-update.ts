import type { TripDetails, TripUpdate } from "@/types/chat"

/** What the user changed in the trip settings form; null when nothing did. */
export function tripUpdate(current: TripDetails, next: TripDetails): TripUpdate | null {
  const update: TripUpdate = {}
  if (current.start !== next.start || current.end !== next.end) update.dates = { start: next.start, end: next.end }
  if (current.hotel.trim() !== next.hotel.trim()) update.hotel = next.hotel.trim()
  if (current.prefs.trim() !== next.prefs.trim()) update.prefs = next.prefs.trim()
  return Object.keys(update).length > 0 ? update : null
}

const missing = "Not specified"
const datesLine = "- Trip dates: "
const hotelLine = "- Accommodation: "
const prefsLine = "- User preferences: "

/**
 * Recovers the change from a system message saved by an older version, which stored the model
 * instruction as text instead of the structured `update`.
 */
export function parseSettingsUpdate(text: string): TripUpdate | null {
  const update: TripUpdate = {}
  for (const line of text.split("\n")) {
    if (line.startsWith(datesLine)) {
      const [start, end] = line.slice(datesLine.length).split(" – ")
      const valid = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null)
      update.dates = { start: valid(start), end: valid(end) }
    } else if (line.startsWith(hotelLine)) {
      const value = line.slice(hotelLine.length)
      update.hotel = value === missing ? "" : value
    } else if (line.startsWith(prefsLine)) {
      const value = line.slice(prefsLine.length)
      update.prefs = value === missing ? "" : value
    }
  }
  return Object.keys(update).length > 0 ? update : null
}

/** The settings change a system message records, from either storage format. */
export function messageUpdate(message: { update?: TripUpdate; text: string }): TripUpdate | null {
  return message.update ?? parseSettingsUpdate(message.text)
}
