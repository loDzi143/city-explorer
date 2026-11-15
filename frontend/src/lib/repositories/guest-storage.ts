import type { Trip } from "@/types/chat"
import type { Lang } from "@/types/lang"
import { parseLegacyChat, parseTrip, parseTrips } from "@/utils/trip-codec"

// Guest data stays in the format the zustand `persist` middleware wrote before accounts existed:
// `{ "state": { trips, activeId, lang?, dark? }, "version": 1 }` under `city-explorer-trips`.
// Data under the older `city-explorer-chats` key is read once and rewritten under the new key.
export const GUEST_STORAGE_KEY = "city-explorer-trips"
export const LEGACY_GUEST_STORAGE_KEY = "city-explorer-chats"
const VERSION = 1

export type GuestSnapshot = {
  trips: Trip[]
  activeId: string | null
  /** Present only when the guest picked a language explicitly; otherwise the system language is used. */
  lang?: Lang
  dark?: boolean
}

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY) ?? localStorage.getItem(LEGACY_GUEST_STORAGE_KEY)
    if (!raw) return null
    const envelope = JSON.parse(raw) as { state?: unknown } | null
    return envelope && typeof envelope === "object" ? envelope.state : null
  } catch {
    return null
  }
}

export function readGuestSnapshot(): GuestSnapshot {
  const data = readRaw()
  if (!data || typeof data !== "object") return { trips: [], activeId: null }
  const saved = data as { trips?: unknown; chats?: unknown; activeId?: unknown; lang?: unknown; dark?: unknown }
  const trips = Array.isArray(saved.trips) ? parseTrips(saved.trips, parseTrip) : Array.isArray(saved.chats) ? parseTrips(saved.chats, parseLegacyChat) : []
  const snapshot: GuestSnapshot = {
    trips,
    activeId: typeof saved.activeId === "string" ? saved.activeId : null,
  }
  if (saved.lang === "en" || saved.lang === "ru") snapshot.lang = saved.lang
  if (typeof saved.dark === "boolean") snapshot.dark = saved.dark
  return snapshot
}

export function writeGuestSnapshot(snapshot: GuestSnapshot) {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ state: snapshot, version: VERSION }))
    localStorage.removeItem(LEGACY_GUEST_STORAGE_KEY)
  } catch {
    // Storage full or blocked (private mode): the session keeps working in memory.
  }
}

/** Removes guest trips after they were moved into an account; language and theme stay. */
export function clearGuestTrips() {
  const { lang, dark } = readGuestSnapshot()
  writeGuestSnapshot({ trips: [], activeId: null, ...(lang ? { lang } : {}), ...(dark !== undefined ? { dark } : {}) })
}

/** Remembers that this browser had an account session, so a failed check isn't mistaken for a guest. */
const SESSION_HINT_KEY = "city-explorer-session"

export function hadAccountSession() {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === "account"
  } catch {
    return false
  }
}

export function rememberAccountSession(active: boolean) {
  try {
    if (active) localStorage.setItem(SESSION_HINT_KEY, "account")
    else localStorage.removeItem(SESSION_HINT_KEY)
  } catch {
    // Only a hint; nothing breaks without it.
  }
}
