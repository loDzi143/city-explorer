import { z } from "zod"

import { chatMessagesSchema } from "@/modules/ai/llm/chat.schemas"

import type { AgentResponse, ItineraryDay, ItineraryPlace, TripAgentInput } from "./agent.types"

const coordinatesSchema = z.object({
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180),
})

const itineraryPlaceSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z
    .string()
    .max(4_000)
    .optional()
    .transform((value) => value ?? ""),
  coordinates: coordinatesSchema,
})

const messageSchema = z.string().trim().min(1).max(50_000)

const destinationSchema = z.object({
  city: z.string().trim().min(1).max(200),
  country: z.string().trim().max(200),
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180),
})

const tripAgentBodySchema = z
  .object({
    messages: chatMessagesSchema,
    destination: destinationSchema,
  })
  .refine((value) => value.messages[0]?.role === "system")

export function parseTripAgentBody(payload: unknown): { ok: true; data: TripAgentInput } | { ok: false; error: string } {
  const result = tripAgentBodySchema.safeParse(payload)
  if (!result.success) {
    const destination = result.error.issues.some((issue) => issue.path[0] === "destination")
    if (destination) return { ok: false, error: "Destination is required" }
    const tooLong = result.error.issues.some((issue) => issue.code === "too_big")
    return { ok: false, error: tooLong ? "Message is too long" : "Message is required" }
  }
  return { ok: true, data: result.data }
}

export function parseAgentResponse(content: string): AgentResponse | null {
  const payload = jsonFromContent(content)
  if (!isRecord(payload)) return null
  const message = messageSchema.safeParse(payload.message)
  if (!message.success) return null
  const days = Array.isArray(payload.days) ? payload.days.flatMap(readItineraryDay).slice(0, 120) : []
  return { message: message.data, days }
}

function readItineraryDay(value: unknown): ItineraryDay[] {
  if (!isRecord(value)) return []
  const date = normalizeDate(value.date)
  if (!date) return []
  const places = Array.isArray(value.places) ? value.places.flatMap(readItineraryPlace).slice(0, 40) : []
  return [{ date, places }]
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

function normalizeDate(value: unknown) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
