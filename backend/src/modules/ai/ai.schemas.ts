import { z } from "zod"

import { normalizeDate, readConversationContext, readHints, readItineraryDays } from "@/modules/ai/agents/agent.schemas"
import type { ConversationContext, ItineraryDay, TripChatInput, TripSettingsChange } from "@/modules/ai/agents/agent.types"
import { languages } from "@/shared/types/language"

export const HOTEL_MAX = 1_000
export const PREFS_MAX = 4_000
export const USER_MESSAGE_MAX = 20_000
const MAX_TURNS = 50

/** YYYY-MM-DD that is a real calendar date. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => normalizeDate(value) === value, "Invalid date")

export const destinationSchema = z.object({
  city: z.string().trim().min(1).max(200),
  country: z.string().trim().max(200),
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180),
})

export const tripDetailsSchema = z
  .object({
    start: isoDateSchema.nullable(),
    end: isoDateSchema.nullable(),
    hotel: z.string().max(HOTEL_MAX).transform((value) => value.trim()),
    prefs: z.string().max(PREFS_MAX).transform((value) => value.trim()),
  })
  .refine((value) => !value.start || !value.end || value.start <= value.end, { message: "Trip end is before its start", path: ["end"] })

/** Itinerary days are read leniently, like a model reply: malformed days and places are dropped, not rejected. */
export const itineraryDaysSchema = z.array(z.unknown()).transform((days): ItineraryDay[] => readItineraryDays(days))

/** Hints are read like a model reply too: extra or overlong ones are cut, not rejected. */
export const hintsSchema = z.unknown().transform((value): string[] => readHints(value))

export const conversationContextSchema = z
  .unknown()
  .transform((value): ConversationContext | null => readConversationContext(value))

export const settingsChangeSchema = z
  .object({
    dates: z.object({ start: isoDateSchema.nullable(), end: isoDateSchema.nullable() }).optional(),
    hotel: z.string().max(HOTEL_MAX).optional(),
    prefs: z.string().max(PREFS_MAX).optional(),
  })
  .strict()
  .transform((value): TripSettingsChange => value)
  .refine((value) => Object.keys(value).length > 0, "Empty settings change")

export const userMessageTextSchema = z.string().trim().min(1).max(USER_MESSAGE_MAX)

const turnSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), text: userMessageTextSchema }),
  z.object({ type: z.literal("settings"), update: settingsChangeSchema }),
])

const guestChatBodySchema = z.object({
  language: z.enum(languages),
  trip: z.object({
    destination: destinationSchema,
    details: tripDetailsSchema,
    plan: z.object({ days: itineraryDaysSchema }).nullable(),
    conversationContext: conversationContextSchema.optional().transform((value) => value ?? null),
    initial: z.boolean(),
  }),
  turns: z.array(turnSchema).max(MAX_TURNS),
})

/**
 * Body of POST /api/chat for guests. It carries trip data and the new messages only: there is
 * no field for a system prompt or model messages, and any extra property is ignored.
 */
export function parseGuestChatBody(payload: unknown): { ok: true; data: TripChatInput } | { ok: false; error: string } {
  const result = guestChatBodySchema.safeParse(payload)
  if (!result.success) {
    const tooLong = result.error.issues.some((issue) => issue.code === "too_big")
    const destination = result.error.issues.some((issue) => issue.path[0] === "trip" && issue.path[1] === "destination")
    if (destination) return { ok: false, error: "Destination is required" }
    return { ok: false, error: tooLong ? "Message is too long" : "Invalid chat request" }
  }
  const { trip, turns, language } = result.data
  return { ok: true, data: { state: trip, turns, language } }
}
