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

export type AgentResponse = {
  message: string
  days: ItineraryDay[]
  hints?: string[]
}
