import type { Place } from "@/types/place"

export type ChatMessage = {
  id: string
  role: "user" | "ai" | "system"
  text: string
}

export type TripDay = {
  date: string
  places: {
    id: string
    name: string
    description: string
    coordinates: {
      latitude: number
      longitude: number
    }
  }[]
}

export type Chat = {
  id: string
  cityId: string | null
  place: Place | null
  start: string | null
  end: string | null
  hotel: string
  prefs: string
  messages: ChatMessage[] | null
  tripDays: TripDay[]
  hints: string[]
  name?: string
}

export type TripDetails = Pick<Chat, "cityId" | "place" | "start" | "end" | "hotel" | "prefs">
