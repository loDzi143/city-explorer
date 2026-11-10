import { dict, tr } from "@/lib/i18n"
import type { Lang } from "@/types/lang"
import { formatItineraryDay } from "@/utils/dates"

const itineraryTitles = [dict.en.itinerary, dict.ru.itinerary]
const itineraryMarker = new RegExp(`^(?:## )?(${itineraryTitles.map(escapeRegExp).join("|")})\\s*$`, "gm")

type ItineraryDay = {
  date: string
  places: {
    name: string
    description: string
  }[]
}

export function messageWithItinerary(message: string, days: ItineraryDay[], lang: Lang) {
  if (days.length === 0) return message
  const labels = tr(lang)
  const parts = [message.trim(), `${labels.itinerary}`]
  for (const day of days) {
    const heading = /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? formatItineraryDay(day.date, lang) : day.date.trim()
    const places: string[] = []
    for (const place of day.places) {
      const name = oneLine(place.name)
      if (!name) continue
      const description = oneLine(place.description)
      const item = description ? `${places.length + 1}. **${name}** — ${description}` : `${places.length + 1}. **${name}**`
      places.push(item)
    }
    parts.push([`### ${heading}`, ...places].join("\n"))
  }
  return parts.filter(Boolean).join("\n\n")
}

export function splitItinerary(text: string) {
  const matches = [...text.matchAll(itineraryMarker)]
  const match = matches.at(-1)
  if (!match || match.index == null) return { body: text, plan: null }
  const body = text.slice(0, match.index).trim()
  const plan = text.slice(match.index + match[0].length).trim()
  if (!plan) return { body: text, plan: null }
  return { body, plan: { title: match[1], text: plan } }
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
