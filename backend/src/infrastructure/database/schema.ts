import { sql } from "drizzle-orm"
import { bigint, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
const updatedAt = () => timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored lowercased; uniqueness is case-insensitive by construction. */
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("users_username_key").on(table.username),
    check("users_username_lowercase_check", sql`${table.username} = lower(${table.username})`),
  ],
)

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the cookie token. The token itself is never stored. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: createdAt(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_key").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
)

export const userSettings = pgTable(
  "user_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    language: text("language", { enum: ["ru", "en"] }).notNull().default("en"),
    theme: text("theme", { enum: ["light", "dark"] }).notNull().default("light"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("user_settings_user_id_key").on(table.userId),
    check("user_settings_language_check", sql`${table.language} in ('ru', 'en')`),
    check("user_settings_theme_check", sql`${table.theme} in ('light', 'dark')`),
  ],
)

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    /** Destination city as returned by /api/locations/suggest. Null until the trip form is submitted. */
    place: jsonb("place").$type<TripPlaceColumn>(),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    hotel: text("hotel").notNull().default(""),
    prefs: text("prefs").notNull().default(""),
    hints: jsonb("hints").$type<string[]>().notNull().default([]),
    conversationContext: jsonb("conversation_context").$type<ConversationContextColumn>(),
    /** Bumped by every change that affects the conversation; replies are applied only to the version they were generated for. */
    version: integer("version").notNull().default(1),
    /** Id of the guest trip this one was imported from; prevents importing it twice. */
    guestId: text("guest_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("trips_user_id_created_at_idx").on(table.userId, table.createdAt),
    uniqueIndex("trips_user_id_guest_id_key").on(table.userId, table.guestId),
    check("trips_dates_check", sql`${table.startDate} is null or ${table.endDate} is null or ${table.startDate} <= ${table.endDate}`),
  ],
)

export const tripMessages = pgTable(
  "trip_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** Insertion order inside a trip. */
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    /** For a system message: the trip settings the user changed in the form. */
    settingsUpdate: jsonb("settings_update").$type<SettingsUpdateColumn>(),
    createdAt: createdAt(),
  },
  (table) => [
    index("trip_messages_trip_id_seq_idx").on(table.tripId, table.seq),
    check("trip_messages_role_check", sql`${table.role} in ('user', 'assistant', 'system')`),
  ],
)

export const tripPlans = pgTable(
  "trip_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    days: jsonb("days").$type<PlanDayColumn[]>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("trip_plans_trip_id_seq_idx").on(table.tripId, table.seq)],
)

export type TripPlaceColumn = {
  id: string
  city: string
  country: string
  countryCode: string | null
  longitude: number
  latitude: number
  bbox: [number, number, number, number] | null
}

export type ConversationContextColumn = {
  activeTopic: string | null
  pendingQuestion: string | null
  discussedOptions: string[]
  unresolvedReferences: string[]
}

export type SettingsUpdateColumn = {
  dates?: { start: string | null; end: string | null }
  hotel?: string
  prefs?: string
}

export type PlanDayColumn = {
  date: string
  places: {
    id: string
    name: string
    description: string
    coordinates: { latitude: number; longitude: number }
  }[]
}
