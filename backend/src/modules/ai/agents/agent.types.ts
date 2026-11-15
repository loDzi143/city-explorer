import type { ChatMessage } from "@/modules/ai/llm/chat.types"

export type TripDestination = {
  city: string
  country: string
  latitude: number
  longitude: number
}

export type TripAgentInput = {
  messages: ChatMessage[]
  destination: TripDestination
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
