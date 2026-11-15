import type { ConversationContext, ItineraryDay, TripDetailsState, TripSettingsChange } from "@/modules/ai/agents/agent.types"

/** Destination city, the same shape as a /api/locations/suggest item. */
export type Place = {
  id: string
  city: string
  country: string
  countryCode: string | null
  longitude: number
  latitude: number
  bbox: [number, number, number, number] | null
}

export type TripDetails = TripDetailsState & {
  /** Id of the destination place; null until the trip form is submitted. */
  cityId: string | null
}

/** Chat message as the frontend shows it. The assistant role is called "ai" there. */
export type TripMessage = {
  id: string
  role: "user" | "ai" | "system"
  text: string
  /** For a system message: the trip settings the user changed in the form. */
  update?: TripSettingsChange
  createdAt: string
}

export type TripPlan = {
  /** ISO date and time when the plan version was saved. */
  date: string
  start: string | null
  end: string | null
  days: ItineraryDay[]
}

export type Trip = {
  id: string
  name: string
  place: Place | null
  details: TripDetails
  /** Null while the trip has no destination yet (the form is shown instead of the chat). */
  messages: TripMessage[] | null
  hints: string[]
  /** Every saved plan version, oldest first; the last one is current. */
  plans: TripPlan[]
  conversationContext: ConversationContext | null
  /** Increases with every change that affects the conversation. */
  version: number
  createdAt: string
  updatedAt: string
}

export type CreateTripInput = {
  /** Client-generated id, so a retried request doesn't create a second trip. */
  id?: string
  name?: string
}

export type UpdateTripInput = {
  name?: string
  place?: Place
  details?: TripDetailsState
}

export type NewUserMessage = {
  /** Client-generated id; sending the same message twice stores it once. */
  id: string
  text: string
}

/** A trip from the browser's localStorage, as sent by POST /api/account/import-guest-data. */
export type GuestTrip = {
  id: string
  name: string
  place: Place | null
  details: TripDetailsState
  messages: GuestMessage[] | null
  hints: string[]
  plans: TripPlan[]
  conversationContext: ConversationContext | null
}

export type GuestMessage =
  | { role: "user"; text: string }
  | { role: "ai"; text: string }
  | { role: "system"; update: TripSettingsChange }

export type ImportResult = {
  imported: number
  /** Trips already imported into this account earlier. */
  skipped: number
  trips: Trip[]
}
