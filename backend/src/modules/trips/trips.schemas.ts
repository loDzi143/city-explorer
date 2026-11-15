import { z } from "zod"

import {
  conversationContextSchema,
  hintsSchema,
  isoDateSchema,
  itineraryDaysSchema,
  settingsChangeSchema,
  tripDetailsSchema,
  userMessageTextSchema,
} from "@/modules/ai/ai.schemas"

import type { CreateTripInput, GuestMessage, GuestTrip, NewUserMessage, UpdateTripInput } from "./trips.types"

const NAME_MAX = 200
const MAX_IMPORT_TRIPS = 100
const MAX_IMPORT_MESSAGES = 1_000
const MAX_IMPORT_PLANS = 200
const MAX_SEND_MESSAGES = 20

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string) {
  return UUID.test(value)
}

const uuidSchema = z.string().regex(UUID, "Invalid id").transform((value) => value.toLowerCase())

const finite = z.number().finite()

export const placeSchema = z.object({
  id: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(200),
  country: z.string().trim().max(200),
  countryCode: z.string().trim().max(10).nullable(),
  longitude: finite.gte(-180).lte(180),
  latitude: finite.gte(-90).lte(90),
  bbox: z.tuple([finite, finite, finite, finite]).nullable(),
})

const nameSchema = z.string().max(NAME_MAX).transform((value) => value.trim())

const createTripSchema = z.object({
  id: uuidSchema.optional(),
  name: nameSchema.optional(),
})

const updateTripSchema = z
  .object({
    name: nameSchema.refine((value) => value.length > 0, "Name must not be empty").optional(),
    place: placeSchema.optional(),
    details: tripDetailsSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.place !== undefined || value.details !== undefined, "Nothing to update")

const sendMessagesSchema = z.object({
  messages: z
    .array(z.object({ id: uuidSchema, text: userMessageTextSchema }))
    .min(1)
    .max(MAX_SEND_MESSAGES)
    .refine((messages) => new Set(messages.map((message) => message.id)).size === messages.length, "Duplicate message id"),
})

/** The old frontend stored the whole reply JSON as the assistant text; only its `message` is kept. */
function assistantText(text: string) {
  const trimmed = text.trim()
  if (!trimmed.startsWith("{")) return text
  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown }
    return typeof parsed.message === "string" && parsed.message.trim() ? parsed.message : text
  } catch {
    return text
  }
}

const guestMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), text: z.string().max(20_000) }),
  z.object({ role: z.literal("ai"), text: z.string().max(100_000).transform(assistantText) }),
  z.object({ role: z.literal("system"), update: settingsChangeSchema }),
])

const guestPlanSchema = z.object({
  date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid plan date"),
  start: isoDateSchema.nullable(),
  end: isoDateSchema.nullable(),
  days: itineraryDaysSchema,
})

const guestTripSchema = z.object({
  // Any non-empty id: it only identifies the guest trip for de-duplication.
  id: z.string().trim().min(1).max(100),
  name: nameSchema.default(""),
  place: placeSchema.nullable(),
  details: tripDetailsSchema,
  messages: z
    .array(guestMessageSchema)
    .max(MAX_IMPORT_MESSAGES)
    .nullable()
    .transform((messages): GuestMessage[] | null => messages?.filter((message) => message.role === "system" || message.text.trim()) ?? null),
  hints: hintsSchema,
  plans: z.array(guestPlanSchema).max(MAX_IMPORT_PLANS).default([]),
  conversationContext: conversationContextSchema.optional().transform((value) => value ?? null),
})

const importSchema = z.object({
  trips: z
    .array(guestTripSchema)
    .max(MAX_IMPORT_TRIPS)
    .refine((trips) => new Set(trips.map((trip) => trip.id)).size === trips.length, "Duplicate trip id"),
})

type Parsed<T> = { ok: true; data: T } | { ok: false; error: string }

function issue(error: z.ZodError, fallback: string) {
  const tooBig = error.issues.some((item) => item.code === "too_big")
  if (tooBig) return "Request is too large"
  const message = error.issues[0]?.message
  return message && !message.startsWith("Invalid input") ? message : fallback
}

export function parseCreateTripBody(payload: unknown): Parsed<CreateTripInput> {
  const result = createTripSchema.safeParse(payload)
  return result.success ? { ok: true, data: result.data } : { ok: false, error: issue(result.error, "Invalid trip") }
}

export function parseUpdateTripBody(payload: unknown): Parsed<UpdateTripInput> {
  const result = updateTripSchema.safeParse(payload)
  return result.success ? { ok: true, data: result.data } : { ok: false, error: issue(result.error, "Invalid trip update") }
}

export function parseSendMessagesBody(payload: unknown): Parsed<NewUserMessage[]> {
  const result = sendMessagesSchema.safeParse(payload)
  return result.success ? { ok: true, data: result.data.messages } : { ok: false, error: issue(result.error, "Message is required") }
}

export function parseImportBody(payload: unknown): Parsed<GuestTrip[]> {
  const result = importSchema.safeParse(payload)
  return result.success ? { ok: true, data: result.data.trips } : { ok: false, error: issue(result.error, "Invalid guest data") }
}
