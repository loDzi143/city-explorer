import { z } from "zod"

import { isRecord } from "@/shared/lib/is-record"

import type { AgentResponse, ConversationContext, ItineraryDay, ItineraryPlace, TripSettingsUpdate } from "./agent.types"

const coordinatesSchema = z.object({
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180),
})

const MAX_DAYS = 120
const MAX_PLACES_PER_DAY = 40
const MAX_DESCRIPTION = 4_000
const MAX_HINTS = 10
const MAX_HINT = 200

const itineraryPlaceSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(300),
  // An overlong description is cut, not a reason to lose the place.
  description: z
    .string()
    .optional()
    .transform((value) => (value ?? "").slice(0, MAX_DESCRIPTION)),
  coordinates: coordinatesSchema,
})

const messageSchema = z.string().trim().min(1).max(50_000)

export function parseAgentResponse(content: string): AgentResponse | null {
  const payload = jsonFromContent(content)
  if (!isRecord(payload)) return null
  const message = messageSchema.safeParse(payload.message)
  if (!message.success) return null
  const days = readItineraryDays(payload.days)
  const hints = readHints(payload.hints)
  const settings = readSettings(payload.settings)
  const conversationContext = readConversationContext(payload.conversationContext)
  const response: AgentResponse = { message: message.data, days }
  if (hints.length > 0) response.hints = hints
  if (conversationContext) response.conversationContext = conversationContext
  if (settings) response.settings = settings
  return response
}

export function readConversationContext(value: unknown): ConversationContext | null {
  if (!isRecord(value)) return null
  const text = (item: unknown) => (typeof item === "string" && item.trim() ? item.trim().slice(0, 1_000) : null)
  const list = (items: unknown) => readStrings(items).slice(0, 20).map((item) => item.slice(0, 1_000))
  return {
    activeTopic: text(value.activeTopic),
    pendingQuestion: text(value.pendingQuestion),
    discussedOptions: list(value.discussedOptions),
    unresolvedReferences: list(value.unresolvedReferences),
  }
}

function readSettings(value: unknown): TripSettingsUpdate | null {
  if (!isRecord(value)) return null
  const settings: TripSettingsUpdate = {}
  const start = normalizeDate(value.start)
  const end = normalizeDate(value.end)
  if (start) settings.start = start
  if (end) settings.end = end
  if (typeof value.hotel === "string") settings.hotel = value.hotel.trim().slice(0, 1_000)
  if (typeof value.prefs === "string") settings.prefs = value.prefs.trim().slice(0, 4_000)
  return Object.keys(settings).length > 0 ? settings : null
}

function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== "string") return []
    const text = item.trim()
    return text ? [text] : []
  })
}

/** Suggested next messages: short, and only a handful fit under the chat input. */
export function readHints(value: unknown): string[] {
  return readStrings(value)
    .slice(0, MAX_HINTS)
    .map((hint) => hint.slice(0, MAX_HINT))
}

/**
 * Reads itinerary days leniently: a malformed day or place is dropped instead of failing the whole
 * plan. A date may appear once; the plan is addressed by date, so a repeated day would be unreachable.
 */
export function readItineraryDays(value: unknown): ItineraryDay[] {
  if (!Array.isArray(value)) return []
  const dates = new Set<string>()
  const days: ItineraryDay[] = []
  for (const item of value) {
    const day = readItineraryDay(item)
    if (!day || dates.has(day.date)) continue
    dates.add(day.date)
    days.push(day)
    if (days.length === MAX_DAYS) break
  }
  return days
}

function readItineraryDay(value: unknown): ItineraryDay | null {
  if (!isRecord(value)) return null
  const date = normalizeDate(value.date)
  if (!date) return null
  const places = Array.isArray(value.places) ? value.places.flatMap(readItineraryPlace).slice(0, MAX_PLACES_PER_DAY) : []
  return { date, places }
}

function readItineraryPlace(value: unknown): ItineraryPlace[] {
  if (!isRecord(value)) return []
  const coordinates = isRecord(value.coordinates) ? value.coordinates : {}
  const parsed = itineraryPlaceSchema.safeParse({
    ...value,
    coordinates: {
      latitude: finiteNumber(coordinates.latitude),
      longitude: finiteNumber(coordinates.longitude),
    },
  })
  return parsed.success ? [parsed.data] : []
}

function jsonFromContent(content: string): unknown {
  const withoutThink = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
  const fenced = withoutThink.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = (fenced?.[1] ?? withoutThink).trim()
  const direct = parseJson(source)
  if (isRecord(direct)) return direct
  return jsonObject(source)
}

function jsonObject(source: string): unknown {
  const start = source.indexOf("{")
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === "{") depth += 1
    else if (char === "}") {
      depth -= 1
      if (depth === 0) {
        const parsed = parseJson(source.slice(start, index + 1))
        if (isRecord(parsed)) return parsed
        return jsonObject(source.slice(index + 1))
      }
    }
  }
  return null
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function normalizeDate(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const dotted = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  const date = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : dotted ? `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}` : null
  return date && isIsoDate(date) ? date : null
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string" || !value.trim()) return value
  const number = Number(value)
  return Number.isFinite(number) ? number : value
}

function isIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
