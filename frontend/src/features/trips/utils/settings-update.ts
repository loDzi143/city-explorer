import type { SettingsNotice, TripDetails, TripUpdate } from "@/types/chat"

const missing = "Not specified"
const datesLine = "- Trip dates: "
const hotelLine = "- Accommodation: "
const prefsLine = "- User preferences: "

export function tripUpdate(current: TripDetails, next: TripDetails): TripUpdate | null {
  const update: TripUpdate = {}
  if (current.start !== next.start || current.end !== next.end) update.dates = { start: next.start, end: next.end }
  if (current.hotel.trim() !== next.hotel.trim()) update.hotel = next.hotel.trim()
  if (current.prefs.trim() !== next.prefs.trim()) update.prefs = next.prefs.trim()
  return Object.keys(update).length > 0 ? update : null
}

/** System message for the model plus the structured change shown to the user. */
export function settingsUpdateNotice(current: TripDetails, next: TripDetails): SettingsNotice | null {
  const update = tripUpdate(current, next)
  if (!update) return null
  const lines: string[] = []
  if (update.dates) {
    const { start, end } = update.dates
    lines.push(`${datesLine}${start && end ? `${start} – ${end}` : missing}`)
  }
  if (update.hotel !== undefined) lines.push(`${hotelLine}${update.hotel || missing}`)
  if (update.prefs !== undefined) lines.push(`${prefsLine}${update.prefs || missing}`)
  const text = [
    "The user has updated their trip settings:",
    ...lines,
    "Use the updated details when continuing to plan or modify the trip. Reconsider affected recommendations and itinerary items if necessary. Preserve existing itinerary elements that are not affected by these changes.",
  ].join("\n")
  return { text, update }
}

/** Recovers the change from a system message saved before `update` was stored. */
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
