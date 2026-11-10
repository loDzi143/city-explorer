import type { Chat, TripDetails } from "@/types/chat"

const missing = "Not specified"

export function settingsUpdateMessage(chat: Chat, next: TripDetails) {
  const lines: string[] = []
  if (chat.start !== next.start || chat.end !== next.end) {
    const dateRange = next.start && next.end ? `${next.start} – ${next.end}` : missing
    lines.push(`- Trip dates: ${dateRange}`)
  }
  if (chat.hotel.trim() !== next.hotel.trim()) {
    lines.push(`- Accommodation: ${next.hotel.trim() || missing}`)
  }
  if (chat.prefs.trim() !== next.prefs.trim()) {
    lines.push(`- User preferences: ${next.prefs.trim() || missing}`)
  }
  if (lines.length === 0) return null
  return [
    "The user has updated their trip settings:",
    ...lines,
    "Use the updated details when continuing to plan or modify the trip. Reconsider affected recommendations and itinerary items if necessary. Preserve existing itinerary elements that are not affected by these changes.",
  ].join("\n")
}
