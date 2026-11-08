import type { Lang } from "@/types/lang"
import type { Place } from "@/types/place"

export type ChatMessage = {
  id: string
  role: "user" | "ai"
  text: Record<Lang, string>
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
  name?: string
}

export type TripDetails = Pick<Chat, "cityId" | "place" | "start" | "end" | "hotel" | "prefs">
