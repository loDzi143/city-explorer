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

export type AgentResponse = {
  message: string
  days: ItineraryDay[]
  hints?: string[]
  settings?: TripSettingsUpdate
}
