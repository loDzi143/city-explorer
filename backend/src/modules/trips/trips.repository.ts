import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { getDb, schema, type Database, type DatabaseExecutor } from "@/infrastructure/database/client"
import type { ConversationContext, ItineraryDay, TripDetailsState, TripSettingsChange } from "@/modules/ai/agents/agent.types"

import type { GuestTrip, Place, Trip, TripMessage, TripPlan } from "./trips.types"

const { tripMessages, tripPlans, trips } = schema

type TripRow = typeof trips.$inferSelect
type MessageRow = typeof tripMessages.$inferSelect
type PlanRow = typeof tripPlans.$inferSelect

/** The locked trip row inside a transaction. */
export type TripHead = {
  id: string
  place: Place | null
  details: TripDetailsState
  version: number
}

function toMessage(row: MessageRow): TripMessage {
  const role = row.role === "assistant" ? "ai" : row.role
  const message: TripMessage = { id: row.id, role, text: row.content, createdAt: row.createdAt.toISOString() }
  if (row.role === "system" && row.settingsUpdate) message.update = row.settingsUpdate
  return message
}

function toPlan(row: PlanRow): TripPlan {
  return { date: row.createdAt.toISOString(), start: row.startDate, end: row.endDate, days: row.days }
}

function toTrip(row: TripRow, messages: MessageRow[], plans: PlanRow[]): Trip {
  return {
    id: row.id,
    name: row.name,
    place: row.place,
    details: {
      cityId: row.place?.id ?? null,
      start: row.startDate,
      end: row.endDate,
      hotel: row.hotel,
      prefs: row.prefs,
    },
    messages: row.place ? messages.map(toMessage) : null,
    hints: row.hints,
    plans: plans.map(toPlan),
    conversationContext: row.conversationContext,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toHead(row: TripRow): TripHead {
  return {
    id: row.id,
    place: row.place,
    details: { start: row.startDate, end: row.endDate, hotel: row.hotel, prefs: row.prefs },
    version: row.version,
  }
}

function groupBy<T extends { tripId: string }>(rows: T[]) {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(row.tripId)
    if (group) group.push(row)
    else groups.set(row.tripId, [row])
  }
  return groups
}

/** Every query is scoped by the owner: a trip id alone never reaches another user's data. */
export function createTripsRepository(database: () => Database = getDb) {
  async function assemble(executor: DatabaseExecutor, rows: TripRow[]) {
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    const [messages, plans] = await Promise.all([
      executor.select().from(tripMessages).where(inArray(tripMessages.tripId, ids)).orderBy(asc(tripMessages.seq)),
      executor.select().from(tripPlans).where(inArray(tripPlans.tripId, ids)).orderBy(asc(tripPlans.seq)),
    ])
    const messagesByTrip = groupBy(messages)
    const plansByTrip = groupBy(plans)
    return rows.map((row) => toTrip(row, messagesByTrip.get(row.id) ?? [], plansByTrip.get(row.id) ?? []))
  }

  return {
    transaction<T>(work: (tx: DatabaseExecutor) => Promise<T>) {
      return database().transaction(work)
    },

    async listTrips(userId: string): Promise<Trip[]> {
      const db = database()
      const rows = await db.select().from(trips).where(eq(trips.userId, userId)).orderBy(desc(trips.createdAt), desc(trips.id))
      return assemble(db, rows)
    },

    async getTrip(userId: string, tripId: string, executor?: DatabaseExecutor): Promise<Trip | null> {
      const db = executor ?? database()
      const rows = await db
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
        .limit(1)
      const [trip] = await assemble(db, rows)
      return trip ?? null
    },

    /** Locks the trip row until the transaction ends, so concurrent writes to one trip are serialized. */
    async lockTrip(tx: DatabaseExecutor, userId: string, tripId: string): Promise<TripHead | null> {
      const [row] = await tx
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
        .limit(1)
        .for("update")
      return row ? toHead(row) : null
    },

    /** Inserts the trip; returns null when the id is already taken (by this or another user). */
    async insertTrip(userId: string, input: { id?: string; name: string }): Promise<string | null> {
      const [row] = await database()
        .insert(trips)
        .values({ ...(input.id ? { id: input.id } : {}), userId, name: input.name })
        .onConflictDoNothing({ target: trips.id })
        .returning({ id: trips.id })
      return row?.id ?? null
    },

    async updateTrip(
      tx: DatabaseExecutor,
      tripId: string,
      fields: {
        name?: string
        place?: Place
        details?: TripDetailsState
        hints?: string[]
        conversationContext?: ConversationContext | null
        bumpVersion?: boolean
      },
    ) {
      await tx
        .update(trips)
        .set({
          ...(fields.name !== undefined ? { name: fields.name } : {}),
          ...(fields.place !== undefined ? { place: fields.place } : {}),
          ...(fields.details
            ? { startDate: fields.details.start, endDate: fields.details.end, hotel: fields.details.hotel, prefs: fields.details.prefs }
            : {}),
          ...(fields.hints !== undefined ? { hints: fields.hints } : {}),
          ...(fields.conversationContext !== undefined ? { conversationContext: fields.conversationContext } : {}),
          ...(fields.bumpVersion ? { version: sql`${trips.version} + 1` } : {}),
          // Wall-clock time, not the transaction start: writes to a row are serialized by its lock, so
          // updated_at grows with every committed change and clients can drop stale responses.
          updatedAt: sql`clock_timestamp()`,
        })
        .where(eq(trips.id, tripId))
    },

    async deleteTrip(userId: string, tripId: string): Promise<boolean> {
      const rows = await database()
        .delete(trips)
        .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
        .returning({ id: trips.id })
      return rows.length > 0
    },

    async listMessages(userId: string, tripId: string): Promise<TripMessage[] | null> {
      const db = database()
      const [owned] = await db
        .select({ id: trips.id })
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
        .limit(1)
      if (!owned) return null
      const rows = await db.select().from(tripMessages).where(eq(tripMessages.tripId, tripId)).orderBy(asc(tripMessages.seq))
      return rows.map(toMessage)
    },

    /**
     * Stores user messages by their client ids. Ids already stored for this trip are skipped, which
     * makes retries safe. Returns how many were new, or null if an id belongs to another trip.
     */
    async insertUserMessages(tx: DatabaseExecutor, tripId: string, messages: { id: string; text: string }[]): Promise<number | null> {
      if (messages.length === 0) return 0
      const inserted = await tx
        .insert(tripMessages)
        .values(messages.map((message) => ({ id: message.id, tripId, role: "user" as const, content: message.text })))
        .onConflictDoNothing({ target: tripMessages.id })
        .returning({ id: tripMessages.id })
      if (inserted.length === messages.length) return inserted.length

      const insertedIds = new Set(inserted.map((row) => row.id))
      const existing = messages.filter((message) => !insertedIds.has(message.id)).map((message) => message.id)
      const owners = await tx.select({ id: tripMessages.id, tripId: tripMessages.tripId }).from(tripMessages).where(inArray(tripMessages.id, existing))
      if (owners.some((row) => row.tripId !== tripId)) return null
      return inserted.length
    },

    async insertSystemMessage(tx: DatabaseExecutor, tripId: string, update: TripSettingsChange) {
      await tx.insert(tripMessages).values({ tripId, role: "system", content: "", settingsUpdate: update })
    },

    async insertAssistantMessage(tx: DatabaseExecutor, tripId: string, text: string) {
      await tx.insert(tripMessages).values({ tripId, role: "assistant", content: text })
    },

    async insertPlan(tx: DatabaseExecutor, tripId: string, plan: { start: string | null; end: string | null; days: ItineraryDay[] }) {
      await tx.insert(tripPlans).values({ tripId, startDate: plan.start, endDate: plan.end, days: plan.days })
    },

    /** Guest ids of trips this user has already imported. */
    async importedGuestIds(tx: DatabaseExecutor, userId: string, guestIds: string[]): Promise<Set<string>> {
      if (guestIds.length === 0) return new Set()
      const rows = await tx
        .select({ guestId: trips.guestId })
        .from(trips)
        .where(and(eq(trips.userId, userId), inArray(trips.guestId, guestIds)))
      return new Set(rows.flatMap((row) => (row.guestId ? [row.guestId] : [])))
    },

    /** Inserts one guest trip with its messages and plans; returns false when it was imported concurrently. */
    async insertGuestTrip(tx: DatabaseExecutor, userId: string, trip: GuestTrip, createdAt: Date): Promise<boolean> {
      const [row] = await tx
        .insert(trips)
        .values({
          userId,
          guestId: trip.id,
          name: trip.name,
          place: trip.place,
          startDate: trip.details.start,
          endDate: trip.details.end,
          hotel: trip.details.hotel,
          prefs: trip.details.prefs,
          hints: trip.hints,
          conversationContext: trip.conversationContext,
          createdAt,
          updatedAt: createdAt,
        })
        .onConflictDoNothing({ target: [trips.userId, trips.guestId] })
        .returning({ id: trips.id })
      if (!row) return false

      // Messages get new server ids: guest ids could collide with the same data imported into another account.
      const messages = (trip.place ? (trip.messages ?? []) : []).map((message) =>
        message.role === "system"
          ? { tripId: row.id, role: "system" as const, content: "", settingsUpdate: message.update }
          : { tripId: row.id, role: message.role === "ai" ? ("assistant" as const) : ("user" as const), content: message.text },
      )
      if (messages.length > 0) await tx.insert(tripMessages).values(messages)

      const plans = trip.plans.map((plan) => ({
        tripId: row.id,
        startDate: plan.start,
        endDate: plan.end,
        days: plan.days,
        createdAt: new Date(plan.date),
      }))
      if (plans.length > 0) await tx.insert(tripPlans).values(plans)
      return true
    },
  }
}

export type TripsRepository = ReturnType<typeof createTripsRepository>

export const tripsRepository = createTripsRepository()
