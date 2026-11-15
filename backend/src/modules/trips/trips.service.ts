import type { TripChatState, TripChatTurn, TripDetailsState, TripSettingsChange } from "@/modules/ai/agents/agent.types"
import { tripChatService, type TripChatService } from "@/modules/ai/ai.service"
import { accountService } from "@/modules/account/account.service"
import type { AccountSettings } from "@/modules/account/account.types"
import { AppError } from "@/shared/errors/app-error"

import { tripsRepository, type TripsRepository } from "./trips.repository"
import type { CreateTripInput, GuestTrip, ImportResult, NewUserMessage, Trip, TripMessage, UpdateTripInput } from "./trips.types"

function notFound() {
  // Also used for trips of other users: the response must not reveal that the id exists.
  return new AppError("Trip not found", 404, "Trip not found", "trip_not_found")
}

function tripChanged() {
  return new AppError("Trip changed while the reply was generated", 409, "The trip has changed. Reload it and try again.", "trip_changed")
}

/** What changed between the stored and submitted trip settings; null when nothing did. */
export function settingsChange(current: TripDetailsState, next: TripDetailsState): TripSettingsChange | null {
  const change: TripSettingsChange = {}
  if (current.start !== next.start || current.end !== next.end) change.dates = { start: next.start, end: next.end }
  if (current.hotel.trim() !== next.hotel.trim()) change.hotel = next.hotel.trim()
  if (current.prefs.trim() !== next.prefs.trim()) change.prefs = next.prefs.trim()
  return Object.keys(change).length > 0 ? change : null
}

/** Messages the model has not answered yet: everything after its last reply. */
function unanswered(messages: TripMessage[]) {
  const lastReply = messages.findLastIndex((message) => message.role === "ai")
  return messages.slice(lastReply + 1)
}

function needsReply(messages: TripMessage[]) {
  const last = messages.at(-1)
  return !last || last.role !== "ai"
}

function toTurn(message: TripMessage): TripChatTurn[] {
  if (message.role === "user") return [{ type: "user", text: message.text }]
  if (message.role === "system" && message.update) return [{ type: "settings", update: message.update }]
  return []
}

function chatState(trip: Trip & { place: NonNullable<Trip["place"]>; messages: TripMessage[] }): TripChatState {
  const latest = trip.plans.at(-1)
  return {
    destination: {
      city: trip.place.city,
      country: trip.place.country,
      latitude: trip.place.latitude,
      longitude: trip.place.longitude,
    },
    details: { start: trip.details.start, end: trip.details.end, hotel: trip.details.hotel, prefs: trip.details.prefs },
    plan: latest ? { days: latest.days } : null,
    conversationContext: trip.conversationContext,
    initial: !trip.messages.some((message) => message.role === "ai"),
  }
}

export type TripsServiceDependencies = {
  repository?: TripsRepository
  chat?: Pick<TripChatService, "reply">
  settings?: { getSettings(userId: string): Promise<AccountSettings> }
}

export function createTripsService(dependencies: TripsServiceDependencies = {}) {
  const repository = dependencies.repository ?? tripsRepository
  const chat = dependencies.chat ?? tripChatService
  const settings = dependencies.settings ?? accountService

  async function requireTrip(userId: string, tripId: string) {
    const trip = await repository.getTrip(userId, tripId)
    if (!trip) throw notFound()
    return trip
  }

  /**
   * Generates and stores the assistant reply for the messages the trip has accumulated.
   * The trip is not locked while the model runs; instead the reply is applied only if the trip
   * version is unchanged, so an edit made meanwhile is never overwritten by a stale reply.
   */
  async function respond(userId: string, tripId: string): Promise<Trip> {
    const trip = await requireTrip(userId, tripId)
    const { place, messages } = trip
    if (!place || !messages) {
      throw new AppError("Trip has no destination", 409, "Set the trip destination first", "trip_not_ready")
    }
    // Already answered (e.g. a retry after the response was lost): return the stored result.
    if (!needsReply(messages)) return trip

    const { language } = await settings.getSettings(userId)
    const result = await chat.reply({
      state: chatState({ ...trip, place, messages }),
      turns: unanswered(messages).flatMap(toTurn),
      language,
    })

    await repository.transaction(async (tx) => {
      const head = await repository.lockTrip(tx, userId, tripId)
      if (!head) throw notFound()
      if (head.version !== trip.version) throw tripChanged()
      await repository.insertAssistantMessage(tx, tripId, result.message)
      if (result.plan) await repository.insertPlan(tx, tripId, result.plan)
      await repository.updateTrip(tx, tripId, {
        details: result.details,
        hints: result.hints,
        conversationContext: result.conversationContext,
        bumpVersion: true,
      })
    })
    return requireTrip(userId, tripId)
  }

  return {
    list(userId: string) {
      return repository.listTrips(userId)
    },

    get(userId: string, tripId: string) {
      return requireTrip(userId, tripId)
    },

    async create(userId: string, input: CreateTripInput): Promise<{ trip: Trip; created: boolean }> {
      const id = await repository.insertTrip(userId, { id: input.id, name: input.name ?? "" })
      if (id) return { trip: await requireTrip(userId, id), created: true }
      // The id exists: a retry of our own request returns the trip, someone else's id is a conflict.
      const existing = input.id ? await repository.getTrip(userId, input.id) : null
      if (existing) return { trip: existing, created: false }
      throw new AppError("Trip id is taken", 409, "Trip id is already in use", "trip_id_conflict")
    },

    /**
     * Renames the trip, sets its destination once, or changes its settings. A settings change on a
     * started trip is recorded as a system message, which the next reply turns into an instruction.
     */
    async update(userId: string, tripId: string, input: UpdateTripInput): Promise<Trip> {
      await repository.transaction(async (tx) => {
        const head = await repository.lockTrip(tx, userId, tripId)
        if (!head) throw notFound()

        const settingUp = !head.place && input.place !== undefined
        if (head.place && input.place && input.place.id !== head.place.id) {
          throw new AppError("Destination change", 400, "The destination of a trip can't be changed. Create a new trip instead.", "destination_locked")
        }
        if (settingUp && !(input.details?.start && input.details.end)) {
          throw new AppError("Trip dates missing", 400, "Trip dates are required", "validation_error")
        }

        const change = head.place && input.details ? settingsChange(head.details, input.details) : null
        await repository.updateTrip(tx, tripId, {
          name: input.name,
          place: settingUp ? input.place : undefined,
          details: input.details,
          bumpVersion: settingUp || change !== null,
        })
        if (change) await repository.insertSystemMessage(tx, tripId, change)
      })
      return requireTrip(userId, tripId)
    },

    async remove(userId: string, tripId: string) {
      const deleted = await repository.deleteTrip(userId, tripId)
      if (!deleted) throw notFound()
    },

    async messages(userId: string, tripId: string): Promise<TripMessage[]> {
      const messages = await repository.listMessages(userId, tripId)
      if (!messages) throw notFound()
      return messages
    },

    /** Stores the user's messages (idempotently, by id) and replies to them. */
    async sendMessages(userId: string, tripId: string, messages: NewUserMessage[]): Promise<Trip> {
      await repository.transaction(async (tx) => {
        const head = await repository.lockTrip(tx, userId, tripId)
        if (!head) throw notFound()
        if (!head.place) throw new AppError("Trip has no destination", 409, "Set the trip destination first", "trip_not_ready")
        const inserted = await repository.insertUserMessages(tx, tripId, messages)
        if (inserted === null) throw new AppError("Message id is taken", 409, "Message id is already in use", "message_id_conflict")
        if (inserted > 0) await repository.updateTrip(tx, tripId, { bumpVersion: true })
      })
      // Committed before the model runs: if it fails, the messages are kept and a retry only replies.
      return respond(userId, tripId)
    },

    /** Replies to what is pending: the first itinerary, a settings change or messages from a failed attempt. */
    reply(userId: string, tripId: string) {
      return respond(userId, tripId)
    },

    /**
     * Copies guest trips into the account in one transaction. Trips imported before (matched by
     * their guest id) are skipped, so a repeated import creates no duplicates.
     */
    async importGuestTrips(userId: string, guestTrips: GuestTrip[]): Promise<ImportResult> {
      const counts = await repository.transaction(async (tx) => {
        const known = await repository.importedGuestIds(tx, userId, guestTrips.map((trip) => trip.id))
        const base = Date.now()
        let imported = 0
        // The guest list is newest first; created_at keeps that order among the imported trips.
        for (const [index, trip] of guestTrips.entries()) {
          if (known.has(trip.id)) continue
          if (await repository.insertGuestTrip(tx, userId, trip, new Date(base - index))) imported += 1
        }
        return { imported, skipped: guestTrips.length - imported }
      })
      return { ...counts, trips: await repository.listTrips(userId) }
    },
  }
}

export type TripsService = ReturnType<typeof createTripsService>

export const tripsService = createTripsService()
