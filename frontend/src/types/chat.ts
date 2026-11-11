import type { Place } from "@/types/place"

/** Trip settings changed by the user, with their new values. Only changed fields are present. */
export type TripUpdate = {
  dates?: { start: string | null; end: string | null }
  hotel?: string
  prefs?: string
}

export type ChatMessage = {
  id: string
  role: "user" | "ai" | "system"
  /** Text sent to the model. */
  text: string
  /** For a system message about changed trip settings: what to show the user. */
  update?: TripUpdate
}

export type SettingsNotice = {
  text: string
  update: TripUpdate
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

export type TripDetails = {
  cityId: string | null
  start: string | null
  end: string | null
  hotel: string
  prefs: string
}

export type TripPlan = {
  /** ISO date and time when the plan was saved. */
  date: string
  /** Trip start (YYYY-MM-DD) from the trip details at save time. */
  start: string | null
  /** Trip end (YYYY-MM-DD) from the trip details at save time. */
  end: string | null
  days: TripDay[]
}

export type Trip = {
  id: string
  name: string
  details: TripDetails
  place: Place | null
  messages: ChatMessage[] | null
  hints: string[]
  plans: TripPlan[]
}

export type TripSettings = {
  place: Place
  details: TripDetails
}
