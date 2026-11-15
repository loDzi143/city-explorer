import type { ModelMessage } from "@/modules/ai/llm/chat.types"
import type { Language } from "@/shared/types/language"

export type TripDestination = {
  city: string
  country: string
  latitude: number
  longitude: number
}

export type TripAgentInput = {
  messages: ModelMessage[]
  destination: TripDestination
  /** Places of the saved plan: their ids and coordinates are already verified. */
  knownPlaces?: ItineraryPlace[]
}

export type ItineraryPlace = {
  id: string
  name: string
  description: string
  coordinates: {
    latitude: number
    longitude: number
  }
}

export type ItineraryDay = {
  date: string
  places: ItineraryPlace[]
}

/** Trip settings the user changed during the conversation. Only changed fields are present. */
export type TripSettingsUpdate = {
  start?: string
  end?: string
  hotel?: string
  prefs?: string
}

/** Trip settings the user changed in the trip form, with their new values. Only changed fields are present. */
export type TripSettingsChange = {
  dates?: { start: string | null; end: string | null }
  hotel?: string
  prefs?: string
}

/** Conversational memory the model keeps between requests instead of the chat history. */
export type ConversationContext = {
  activeTopic: string | null
  pendingQuestion: string | null
  discussedOptions: string[]
  unresolvedReferences: string[]
}

export type AgentResponse = {
  message: string
  days: ItineraryDay[]
  hints?: string[]
  conversationContext?: ConversationContext
  settings?: TripSettingsUpdate
}

export type TripDetailsState = {
  start: string | null
  end: string | null
  hotel: string
  prefs: string
}

/** Everything the prompt is built from: the current trip, not the chat transcript. */
export type TripChatState = {
  destination: TripDestination
  details: TripDetailsState
  /** The latest saved plan, null before the first itinerary. */
  plan: { days: ItineraryDay[] } | null
  conversationContext: ConversationContext | null
  /** No assistant reply exists yet for this trip. */
  initial: boolean
}

/** A message the model has not answered yet. */
export type TripChatTurn = { type: "user"; text: string } | { type: "settings"; update: TripSettingsChange }

export type TripChatInput = {
  state: TripChatState
  turns: TripChatTurn[]
  language: Language
}

/** A model reply applied to the trip state. */
export type TripChatResult = {
  /** Text shown in the chat. */
  message: string
  /** Trip details after settings the model changed in the conversation. */
  details: TripDetailsState
  /** A new plan version when the itinerary changed, otherwise null. */
  plan: { start: string | null; end: string | null; days: ItineraryDay[] } | null
  hints: string[]
  /** The context for the next request; the previous one is kept when the reply has none. */
  conversationContext: ConversationContext | null
}
