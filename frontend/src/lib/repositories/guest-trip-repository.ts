import { z } from "zod"

import { api, REPLY_TIMEOUT_MS } from "@/lib/api"
import type { ChatMessage, Trip, TripUpdate } from "@/types/chat"
import { readConversationContext, readHints, readTripDays } from "@/utils/trip-codec"
import { unanswered } from "@/utils/trip-messages"
import { messageUpdate } from "@/utils/trip-update"

import type { TripReducer, TripRepository } from "./trip-repository"

const chatResultSchema = z.object({
  message: z.string().min(1),
  details: z.object({
    start: z.string().nullable(),
    end: z.string().nullable(),
    hotel: z.string(),
    prefs: z.string(),
  }),
  plan: z.object({ start: z.string().nullable(), end: z.string().nullable(), days: z.array(z.unknown()) }).nullable(),
  hints: z.array(z.unknown()),
  conversationContext: z.unknown().nullable(),
})

type Turn = { type: "user"; text: string } | { type: "settings"; update: TripUpdate }

function toTurns(messages: ChatMessage[]): Turn[] {
  return messages.flatMap((message): Turn[] => {
    if (message.role === "user") return [{ type: "user", text: message.text }]
    const update = message.role === "system" ? messageUpdate(message) : null
    return update ? [{ type: "settings", update }] : []
  })
}

/**
 * The trip data the server needs to answer: settings, the current plan, conversationContext and
 * the unanswered messages. No prompt and no chat history: the server builds the model request.
 */
export function guestChatRequest(trip: Trip, lang: string) {
  const place = trip.place
  if (!place) throw new Error("Trip has no destination")
  const messages = trip.messages ?? []
  const plan = trip.plans.at(-1)
  return {
    language: lang,
    trip: {
      destination: { city: place.city, country: place.country, latitude: place.latitude, longitude: place.longitude },
      details: { start: trip.details.start, end: trip.details.end, hotel: trip.details.hotel, prefs: trip.details.prefs },
      plan: plan ? { days: plan.days } : null,
      conversationContext: trip.conversationContext,
      initial: !messages.some((message) => message.role === "ai"),
    },
    turns: toTurns(unanswered(messages)),
  }
}

export function createGuestTripRepository(): TripRepository {
  const none = async () => null

  return {
    mode: "guest",
    createTrip: none,
    renameTrip: none,
    saveTrip: none,
    deleteTrip: async () => {},
    reloadTrip: none,

    async requestReply(trip, lang): Promise<TripReducer> {
      const { data } = await api.post("/api/chat", guestChatRequest(trip, lang), { timeout: REPLY_TIMEOUT_MS })
      const result = chatResultSchema.parse(data)
      const reply: ChatMessage = { id: crypto.randomUUID(), role: "ai", text: result.message }
      const days = result.plan ? readTripDays(result.plan.days) : []

      return (current) => {
        if (current.messages === null) return current
        return {
          ...current,
          details: { ...current.details, ...result.details },
          messages: [...current.messages, reply],
          plans: result.plan && days.length > 0 ? [...current.plans, { date: new Date().toISOString(), start: result.plan.start, end: result.plan.end, days }] : current.plans,
          hints: readHints(result.hints),
          conversationContext: readConversationContext(result.conversationContext),
        }
      }
    },
  }
}
