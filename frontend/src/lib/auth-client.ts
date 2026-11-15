import { z } from "zod"

import { api, IMPORT_TIMEOUT_MS } from "@/lib/api"
import type { Account, AccountSettings } from "@/types/account"
import type { Trip } from "@/types/chat"
import { parseTrips } from "@/utils/trip-codec"

const settingsSchema = z.object({
  language: z.enum(["en", "ru"]),
  theme: z.enum(["light", "dark"]),
})

const accountSchema = z.object({
  user: z.object({ id: z.string().min(1), username: z.string().min(1) }),
  settings: settingsSchema,
})

const importResultSchema = z.object({
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  trips: z.array(z.unknown()),
})

export type Credentials = { username: string; password: string }

/** The signed-in account, or a 401 error for a guest. */
export async function fetchAccount(): Promise<Account> {
  const { data } = await api.get("/api/auth/me")
  return accountSchema.parse(data)
}

export async function login(credentials: Credentials): Promise<Account> {
  const { data } = await api.post("/api/auth/login", credentials)
  return accountSchema.parse(data)
}

/** Creates the account with the language and theme the guest already uses. */
export async function register(credentials: Credentials, settings: AccountSettings): Promise<Account> {
  const { data } = await api.post("/api/auth/register", { ...credentials, settings })
  return accountSchema.parse(data)
}

export async function logout(): Promise<void> {
  await api.post("/api/auth/logout")
}

export async function saveAccountSettings(patch: Partial<AccountSettings>): Promise<AccountSettings> {
  const { data } = await api.patch("/api/account/settings", patch)
  return settingsSchema.parse(data)
}

/** Guest trip as the import endpoint expects it. */
export type GuestTripPayload = {
  id: string
  name: string
  place: Trip["place"]
  details: { start: string | null; end: string | null; hotel: string; prefs: string }
  messages: ({ role: "user" | "ai"; text: string } | { role: "system"; update: NonNullable<Trip["messages"]>[number]["update"] })[] | null
  hints: string[]
  plans: Trip["plans"]
  conversationContext: Trip["conversationContext"]
}

export async function importGuestTrips(trips: GuestTripPayload[]): Promise<{ imported: number; skipped: number; trips: Trip[] }> {
  const { data } = await api.post("/api/account/import-guest-data", { trips }, { timeout: IMPORT_TIMEOUT_MS })
  const result = importResultSchema.parse(data)
  return { imported: result.imported, skipped: result.skipped, trips: parseTrips(result.trips) }
}
