import type { ChatMessage, ConversationContext, Trip, TripDay, TripDetails, TripPlan, TripUpdate } from "@/types/chat"
import { isPlace } from "@/utils/place"

// Readers for trips that come from outside the app's own state: localStorage (possibly written by
// an older version) and API responses. Each returns null or drops an item instead of throwing.

function isDateOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null
}

function readMessageText(value: unknown): string | null {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return null
  const text = value as { en?: unknown; ru?: unknown }
  const en = typeof text.en === "string" ? text.en : null
  const ru = typeof text.ru === "string" ? text.ru : null
  if (en === null && ru === null) return null
  return en || ru || ""
}

function readMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") return null
  const message = value as { id?: unknown; role?: unknown; text?: unknown; update?: unknown }
  const text = readMessageText(message.text)
  if (typeof message.id !== "string" || text === null) return null
  if (message.role !== "user" && message.role !== "ai" && message.role !== "system") return null
  const update = message.role === "system" ? readUpdate(message.update) : null
  return update ? { id: message.id, role: message.role, text, update } : { id: message.id, role: message.role, text }
}

export function readUpdate(value: unknown): TripUpdate | null {
  if (!value || typeof value !== "object") return null
  const raw = value as { dates?: unknown; hotel?: unknown; prefs?: unknown }
  const update: TripUpdate = {}
  if (raw.dates && typeof raw.dates === "object") {
    const dates = raw.dates as { start?: unknown; end?: unknown }
    if (isDateOrNull(dates.start) && isDateOrNull(dates.end)) update.dates = { start: dates.start, end: dates.end }
  }
  if (typeof raw.hotel === "string") update.hotel = raw.hotel
  if (typeof raw.prefs === "string") update.prefs = raw.prefs
  return Object.keys(update).length > 0 ? update : null
}

function readMessages(value: unknown): ChatMessage[] | null | undefined {
  if (value === null) return null
  if (!Array.isArray(value)) return undefined
  const messages: ChatMessage[] = []
  for (const item of value) {
    const message = readMessage(item)
    if (!message) return undefined
    messages.push(message)
  }
  return messages
}

function readDetails(value: unknown): TripDetails | null {
  if (!value || typeof value !== "object") return null
  const details = value as Partial<Record<keyof TripDetails, unknown>>
  if (!isDateOrNull(details.cityId) || !isDateOrNull(details.start) || !isDateOrNull(details.end)) return null
  if (typeof details.hotel !== "string" || typeof details.prefs !== "string") return null
  return { cityId: details.cityId, start: details.start, end: details.end, hotel: details.hotel, prefs: details.prefs }
}

export function parseTrip(value: unknown): Trip | null {
  if (!value || typeof value !== "object") return null
  const trip = value as Partial<Record<keyof Trip, unknown>>
  const details = readDetails(trip.details)
  const messages = readMessages(trip.messages)
  if (typeof trip.id !== "string" || !details || messages === undefined) return null
  const parsed: Trip = {
    id: trip.id,
    name: typeof trip.name === "string" ? trip.name : "",
    details,
    place: isPlace(trip.place) ? trip.place : null,
    messages,
    hints: readHints(trip.hints),
    plans: readPlans(trip.plans),
    conversationContext: readConversationContext(trip.conversationContext),
  }
  if (typeof trip.version === "number" && Number.isInteger(trip.version)) parsed.version = trip.version
  if (typeof trip.updatedAt === "string" && !Number.isNaN(Date.parse(trip.updatedAt))) parsed.updatedAt = trip.updatedAt
  return parsed
}

/** Converts a chat saved under `city-explorer-chats` (flat details + `tripDays`). */
export function parseLegacyChat(value: unknown): Trip | null {
  if (!value || typeof value !== "object") return null
  const chat = value as { id?: unknown; name?: unknown; place?: unknown; messages?: unknown; hints?: unknown; tripDays?: unknown }
  const details = readDetails(chat)
  const messages = readMessages(chat.messages)
  if (typeof chat.id !== "string" || !details || messages === undefined) return null
  const days = readTripDays(chat.tripDays)
  return {
    id: chat.id,
    name: typeof chat.name === "string" ? chat.name : "",
    details,
    place: isPlace(chat.place) ? chat.place : null,
    messages,
    hints: readHints(chat.hints),
    plans: days.length > 0 ? [{ date: new Date().toISOString(), start: details.start, end: details.end, days }] : [],
    conversationContext: null,
  }
}

function readPlans(value: unknown): TripPlan[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const plan = item as Partial<Record<keyof TripPlan, unknown>>
    if (typeof plan.date !== "string" || Number.isNaN(Date.parse(plan.date))) return []
    if (!isDateOrNull(plan.start) || !isDateOrNull(plan.end)) return []
    return [{ date: plan.date, start: plan.start, end: plan.end, days: readTripDays(plan.days) }]
  })
}

export function readTripDays(value: unknown): TripDay[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const day = readTripDay(item)
    return day ? [day] : []
  })
}

function readTripDay(value: unknown): TripDay | null {
  if (!value || typeof value !== "object") return null
  const day = value as TripDay
  const date = typeof day.date === "string" ? day.date.trim() : ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return { date, places: readTripDayPlaces(day.places) }
}

function readTripDayPlaces(value: unknown): TripDay["places"] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const place = readTripDayPlace(item)
    return place ? [place] : []
  })
}

function readTripDayPlace(value: unknown): TripDay["places"][number] | null {
  if (!value || typeof value !== "object") return null
  const place = value as TripDay["places"][number]
  const latitude = place.coordinates?.latitude
  const longitude = place.coordinates?.longitude
  const id = typeof place.id === "string" ? place.id.trim() : ""
  const name = typeof place.name === "string" ? place.name.trim() : ""
  if (!id || !name) return null
  if (typeof place.description !== "string") return null
  if (typeof latitude !== "number" || !Number.isFinite(latitude)) return null
  if (typeof longitude !== "number" || !Number.isFinite(longitude)) return null
  return {
    id,
    name,
    description: place.description,
    coordinates: { latitude, longitude },
  }
}

export function readHints(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== "string") return []
    const hint = item.trim()
    return hint ? [hint] : []
  })
}

export function readConversationContext(value: unknown): ConversationContext | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Partial<Record<keyof ConversationContext, unknown>>
  const text = (item: unknown) => (typeof item === "string" && item.trim() ? item.trim() : null)
  return {
    activeTopic: text(raw.activeTopic),
    pendingQuestion: text(raw.pendingQuestion),
    discussedOptions: readHints(raw.discussedOptions),
    unresolvedReferences: readHints(raw.unresolvedReferences),
  }
}

/** Reads a list of trips, dropping the ones that don't parse. */
export function parseTrips(value: unknown, parse: (item: unknown) => Trip | null = parseTrip): Trip[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const trip = parse(item)
    return trip ? [trip] : []
  })
}
