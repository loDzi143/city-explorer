import type { ModelMessage } from "@/modules/ai/llm/chat.types"

import type {
  AgentResponse,
  ItineraryDay,
  TripChatInput,
  TripChatResult,
  TripChatState,
  TripChatTurn,
  TripDetailsState,
  TripSettingsUpdate,
} from "./agent.types"
import { settingsUpdateInstruction, tripSystemPrompt } from "./trip-prompt"

/**
 * Sent when the trip has no user message yet (the first itinerary). Some models, DeepSeek among
 * them, emit broken tool-call markup when the request has only a system message.
 */
export const START_PLANNING = "Let's start planning this trip."

/**
 * Characters of unanswered messages sent to the model. They pile up only when earlier replies
 * failed; past this size the oldest are left out so the request stays within the model's context.
 */
export const MAX_TURNS_CHARS = 60_000

function turnSize(turn: TripChatTurn) {
  return turn.type === "user" ? turn.text.length : JSON.stringify(turn.update).length
}

/** The newest turns that fit the budget, in their original order. The latest one is always kept. */
export function recentTurns(turns: TripChatTurn[], budget = MAX_TURNS_CHARS): TripChatTurn[] {
  let size = 0
  let first = turns.length
  while (first > 0) {
    size += turnSize(turns[first - 1])
    if (size > budget && first < turns.length) break
    first -= 1
  }
  return turns.slice(first)
}

/**
 * The model gets no chat history. Each request carries the system prompt with the current trip
 * settings and itinerary, the conversationContext from the previous reply, and the messages
 * written since that reply.
 */
export function buildTripMessages({ state, turns, language }: TripChatInput): ModelMessage[] {
  const prompt = tripSystemPrompt(state, language, {
    isInitialRequest: state.initial,
    // On the first request any stored context is stale by definition.
    conversationContext: state.initial ? null : state.conversationContext,
  })

  const messages: ModelMessage[] = [{ role: "system", content: prompt }]
  for (const turn of recentTurns(turns)) {
    if (turn.type === "user") messages.push({ role: "user", content: turn.text })
    else messages.push({ role: "system", content: settingsUpdateInstruction(turn.update) })
  }
  if (turns.length === 0) messages.push({ role: "user", content: START_PLANNING })
  return messages
}

/** Applies settings the model changed in the conversation. A date change that would put start after end is ignored. */
export function applySettingsFromReply(details: TripDetailsState, settings: TripSettingsUpdate | undefined): TripDetailsState {
  if (!settings) return details
  const next: TripDetailsState = { ...details }
  const start = settings.start ?? details.start
  const end = settings.end ?? details.end
  if ((settings.start || settings.end) && start && end && start <= end) {
    next.start = start
    next.end = end
  }
  if (settings.hotel !== undefined) next.hotel = settings.hotel
  if (settings.prefs !== undefined) next.prefs = settings.prefs
  return next
}

/** Plans differ when a day's date, or the ordered set of places in a day, changed. */
export function sameDays(a: ItineraryDay[], b: ItineraryDay[]) {
  if (a.length !== b.length) return false
  return a.every((day, index) => {
    const other = b[index]
    if (!other || day.date !== other.date || day.places.length !== other.places.length) return false
    return day.places.every((place, placeIndex) => {
      const next = other.places[placeIndex]
      return Boolean(next) && place.id === next.id && place.name === next.name
    })
  })
}

/**
 * Turns a model reply into the next trip state. The current plan stays the source of truth:
 * a reply produces a new plan version only when its days actually differ.
 */
export function applyTripReply(state: TripChatState, reply: AgentResponse): TripChatResult {
  const details = applySettingsFromReply(state.details, reply.settings)
  const latest = state.plan?.days ?? null
  const changed = reply.days.length > 0 && (!latest || !sameDays(latest, reply.days))
  return {
    message: reply.message,
    details,
    plan: changed ? { start: details.start, end: details.end, days: reply.days } : null,
    hints: reply.hints ?? [],
    conversationContext: reply.conversationContext ?? state.conversationContext,
  }
}
