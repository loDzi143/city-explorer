import { dict } from "@/lib/i18n"

const itineraryTitles = [dict.en.itinerary, dict.ru.itinerary]
const itineraryMarker = new RegExp(`^(?:## )?(?:${itineraryTitles.map(escapeRegExp).join("|")})\\s*$`, "gm")

/**
 * Older replies had the itinerary appended as a "Trip itinerary" section.
 * The plan is now shown in its own tab, so that section is cut from the message.
 */
export function withoutItinerary(text: string) {
  const match = [...text.matchAll(itineraryMarker)].at(-1)
  if (!match || match.index == null) return text
  const plan = text.slice(match.index + match[0].length).trim()
  if (!plan) return text
  return text.slice(0, match.index).trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
