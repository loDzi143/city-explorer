import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { ChatMessage, SettingsNotice, Trip, TripDay, TripDetails, TripPlan, TripSettings, TripUpdate } from "@/types/chat"
import type { Lang } from "@/types/lang"
import { isPlace, tripPlace } from "@/utils/place"

const STORAGE_KEY = "city-explorer-trips"
const LEGACY_STORAGE_KEY = "city-explorer-chats"

type ChatState = {
  hasHydrated: boolean
  lang: Lang
  dark: boolean
  langChosen: boolean
  darkChosen: boolean
  trips: Trip[]
  activeId: string | null
  setHasHydrated: (hasHydrated: boolean) => void
  setLang: (lang: Lang) => void
  setDark: (dark: boolean) => void
  followSystemLang: () => void
  followSystemDark: () => void
  createTrip: () => void
  selectTrip: (id: string) => void
  renameTrip: (id: string, name: string) => void
  deleteTrip: (id: string) => void
  saveTrip: (id: string, value: TripSettings, notice?: SettingsNotice | null) => void
  sendMessage: (id: string, text: string) => void
  pendingItineraryIds: string[]
  failedItineraryIds: string[]
  beginItinerary: (id: string) => number | null
  finishItinerary: (id: string, text: string, token: number) => void
  failItinerary: (id: string, token?: number) => void
}

type PersistedChatState = Pick<ChatState, "trips" | "activeId"> & {
  lang?: Lang
  dark?: boolean
}

const repliesInFlight = new Set<string>()
const replyTokens = new Map<string, number>()

function replyToken(id: string) {
  return replyTokens.get(id) ?? 0
}

function invalidateReply(id: string) {
  replyTokens.set(id, replyToken(id) + 1)
  repliesInFlight.delete(id)
}

function systemLang(): Lang {
  if (typeof navigator === "undefined") return "en"
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of tags) {
    const base = tag?.toLowerCase().split("-")[0]
    if (base === "ru" || base === "en") return base
  }
  return "en"
}

function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
}

function isDateOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null
}

function readMessageText(value: unknown): string | null {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return null
  const text = value as { en?: unknown; ru?: unknown }
  const en = typeof text.en === "string" ? text.en : null
  const ru = typeof text.ru === "string" ? text.ru : null
  if (en === null && ru === null) return null
  return en || ru || ""
}

function readMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") return null
  const message = value as { id?: unknown; role?: unknown; text?: unknown; update?: unknown }
  const text = readMessageText(message.text)
  if (typeof message.id !== "string" || text === null) return null
  if (message.role !== "user" && message.role !== "ai" && message.role !== "system") return null
  const update = message.role === "system" ? readUpdate(message.update) : null
  return update ? { id: message.id, role: message.role, text, update } : { id: message.id, role: message.role, text }
}

function readUpdate(value: unknown): TripUpdate | null {
  if (!value || typeof value !== "object") return null
  const raw = value as { dates?: unknown; hotel?: unknown; prefs?: unknown }
  const update: TripUpdate = {}
  if (raw.dates && typeof raw.dates === "object") {
    const dates = raw.dates as { start?: unknown; end?: unknown }
    if (isDateOrNull(dates.start) && isDateOrNull(dates.end)) update.dates = { start: dates.start, end: dates.end }
  }
  if (typeof raw.hotel === "string") update.hotel = raw.hotel
  if (typeof raw.prefs === "string") update.prefs = raw.prefs
  return Object.keys(update).length > 0 ? update : null
}

function readMessages(value: unknown): ChatMessage[] | null | undefined {
  if (value === null) return null
  if (!Array.isArray(value)) return undefined
  const messages: ChatMessage[] = []
  for (const item of value) {
    const message = readMessage(item)
    if (!message) return undefined
    messages.push(message)
  }
  return messages
}

function readDetails(value: unknown): TripDetails | null {
  if (!value || typeof value !== "object") return null
  const details = value as Partial<Record<keyof TripDetails, unknown>>
  if (!isDateOrNull(details.cityId) || !isDateOrNull(details.start) || !isDateOrNull(details.end)) return null
  if (typeof details.hotel !== "string" || typeof details.prefs !== "string") return null
  return { cityId: details.cityId, start: details.start, end: details.end, hotel: details.hotel, prefs: details.prefs }
}

function parseTrip(value: unknown): Trip | null {
  if (!value || typeof value !== "object") return null
  const trip = value as Partial<Record<keyof Trip, unknown>>
  const details = readDetails(trip.details)
  const messages = readMessages(trip.messages)
  if (typeof trip.id !== "string" || !details || messages === undefined) return null
  return {
    id: trip.id,
    name: typeof trip.name === "string" ? trip.name : "",
    details,
    place: isPlace(trip.place) ? trip.place : null,
    messages,
    hints: readHints(trip.hints),
    plans: readPlans(trip.plans),
  }
}

/** Converts a chat saved under `city-explorer-chats` (flat details + `tripDays`). */
function parseLegacyChat(value: unknown): Trip | null {
  if (!value || typeof value !== "object") return null
  const chat = value as { id?: unknown; name?: unknown; place?: unknown; messages?: unknown; hints?: unknown; tripDays?: unknown }
  const details = readDetails(chat)
  const messages = readMessages(chat.messages)
  if (typeof chat.id !== "string" || !details || messages === undefined) return null
  const days = readTripDays(chat.tripDays)
  return {
    id: chat.id,
    name: typeof chat.name === "string" ? chat.name : "",
    details,
    place: isPlace(chat.place) ? chat.place : null,
    messages,
    hints: readHints(chat.hints),
    plans: days.length > 0 ? [{ date: new Date().toISOString(), start: details.start, end: details.end, days }] : [],
  }
}

function readPlans(value: unknown): TripPlan[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const plan = item as Partial<Record<keyof TripPlan, unknown>>
    if (typeof plan.date !== "string" || Number.isNaN(Date.parse(plan.date))) return []
    if (!isDateOrNull(plan.start) || !isDateOrNull(plan.end)) return []
    return [{ date: plan.date, start: plan.start, end: plan.end, days: readTripDays(plan.days) }]
  })
}

function readTripDays(value: unknown): TripDay[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const day = readTripDay(item)
    return day ? [day] : []
  })
}

function readTripDay(value: unknown): TripDay | null {
  if (!value || typeof value !== "object") return null
  const day = value as TripDay
  const date = typeof day.date === "string" ? day.date.trim() : ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return { date, places: readTripDayPlaces(day.places) }
}

function readTripDayPlaces(value: unknown): TripDay["places"] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const place = readTripDayPlace(item)
    return place ? [place] : []
  })
}

function readTripDayPlace(value: unknown): TripDay["places"][number] | null {
  if (!value || typeof value !== "object") return null
  const place = value as TripDay["places"][number]
  const latitude = place.coordinates?.latitude
  const longitude = place.coordinates?.longitude
  const id = typeof place.id === "string" ? place.id.trim() : ""
  const name = typeof place.name === "string" ? place.name.trim() : ""
  if (!id || !name) return null
  if (typeof place.description !== "string") return null
  if (typeof latitude !== "number" || !Number.isFinite(latitude)) return null
  if (typeof longitude !== "number" || !Number.isFinite(longitude)) return null
  return {
    id,
    name,
    description: place.description,
    coordinates: { latitude, longitude },
  }
}

function readHints(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== "string") return []
    const hint = item.trim()
    return hint ? [hint] : []
  })
}

function parseReply(text: string): { days: TripDay[]; hints: string[] } {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return { days: [], hints: [] }
  }
  if (!payload || typeof payload !== "object") return { days: [], hints: [] }
  const reply = payload as { days?: unknown; hints?: unknown }
  return { days: readTripDays(reply.days), hints: readHints(reply.hints) }
}

/** Plans differ when a day's date, or the ordered set of places in a day, changed. */
function sameDays(a: TripDay[], b: TripDay[]) {
  if (a.length !== b.length) return false
  return a.every((day, index) => {
    const other = b[index]
    if (day.date !== other.date || day.places.length !== other.places.length) return false
    return day.places.every((place, placeIndex) => {
      const next = other.places[placeIndex]
      return place.id === next.id && place.name === next.name
    })
  })
}

function needsReply(messages: ChatMessage[]) {
  if (messages.length === 0) return true
  const role = messages[messages.length - 1]?.role
  return role === "user" || role === "system"
}

export function tripTitle(trip: Trip, t: { untitled: string }) {
  const custom = trip.name.trim()
  if (custom) return custom
  const place = tripPlace(trip)
  return place ? place.city : t.untitled
}

export function latestPlan(trip: Trip): TripPlan | null {
  return trip.plans.at(-1) ?? null
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      lang: systemLang(),
      dark: prefersDark(),
      langChosen: false,
      darkChosen: false,
      trips: [],
      activeId: null,
      pendingItineraryIds: [],
      failedItineraryIds: [],
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setLang: (lang) => set({ lang, langChosen: true }),
      setDark: (dark) => set({ dark, darkChosen: true }),
      followSystemLang: () => {
        const state = get()
        const lang = systemLang()
        if (state.langChosen || state.lang === lang) return
        set({ lang })
      },
      followSystemDark: () => {
        const state = get()
        const dark = prefersDark()
        if (state.darkChosen || state.dark === dark) return
        set({ dark })
      },
      createTrip: () => {
        const trip: Trip = {
          id: crypto.randomUUID(),
          name: "",
          details: { cityId: null, start: null, end: null, hotel: "", prefs: "" },
          place: null,
          messages: null,
          hints: [],
          plans: [],
        }
        set((state) => ({ trips: [trip, ...state.trips], activeId: trip.id }))
      },
      selectTrip: (id) => set({ activeId: id }),
      renameTrip: (id, name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        set((state) => ({
          trips: state.trips.map((trip) => (trip.id === id ? { ...trip, name: trimmed } : trip)),
        }))
      },
      deleteTrip: (id) =>
        set((state) => {
          const trips = state.trips.filter((trip) => trip.id !== id)
          const activeId = state.activeId === id ? (trips[0]?.id ?? null) : state.activeId
          return { trips, activeId }
        }),
      saveTrip: (id, value, notice) => {
        const text = notice?.text.trim() ?? ""
        if (text) invalidateReply(id)
        const system: ChatMessage | null = notice && text ? { id: crypto.randomUUID(), role: "system", text, update: notice.update } : null
        set((state) => ({
          trips: state.trips.map((trip) => {
            if (trip.id !== id) return trip
            const messages = trip.messages ?? []
            return {
              ...trip,
              place: value.place,
              details: value.details,
              messages: system ? [...messages, system] : messages,
            }
          }),
        }))
      },
      sendMessage: (id, text) => {
        const trimmed = text.trim()
        if (!trimmed) return
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          text: trimmed,
        }
        set((state) => ({
          trips: state.trips.map((trip) =>
            trip.id === id ? { ...trip, messages: [...(trip.messages ?? []), message] } : trip,
          ),
        }))
      },
      beginItinerary: (id) => {
        const trip = get().trips.find((item) => item.id === id)
        if (!trip || trip.messages === null || !needsReply(trip.messages) || repliesInFlight.has(id)) return null
        repliesInFlight.add(id)
        const token = replyToken(id)
        set((state) => ({
          pendingItineraryIds: state.pendingItineraryIds.includes(id) ? state.pendingItineraryIds : [...state.pendingItineraryIds, id],
          failedItineraryIds: state.failedItineraryIds.filter((item) => item !== id),
        }))
        return token
      },
      finishItinerary: (id, text, token) => {
        if (replyToken(id) !== token) return
        repliesInFlight.delete(id)
        const reply: ChatMessage = {
          id: crypto.randomUUID(),
          role: "ai",
          text,
        }
        const { days, hints } = parseReply(text)
        set((state) => ({
          pendingItineraryIds: state.pendingItineraryIds.filter((item) => item !== id),
          failedItineraryIds: state.failedItineraryIds.filter((item) => item !== id),
          trips: state.trips.map((trip) => {
            if (trip.id !== id || trip.messages === null) return trip
            const latest = latestPlan(trip)
            const changed = days.length > 0 && (!latest || !sameDays(latest.days, days))
            const plan: TripPlan | null = changed
              ? { date: new Date().toISOString(), start: trip.details.start, end: trip.details.end, days }
              : null
            return {
              ...trip,
              messages: [...trip.messages, reply],
              plans: plan ? [...trip.plans, plan] : trip.plans,
              hints,
            }
          }),
        }))
      },
      failItinerary: (id, token) => {
        if (token != null && replyToken(id) !== token) return
        repliesInFlight.delete(id)
        set((state) => ({
          pendingItineraryIds: state.pendingItineraryIds.filter((item) => item !== id),
          failedItineraryIds: state.failedItineraryIds.includes(id) ? state.failedItineraryIds : [...state.failedItineraryIds, id],
        }))
      },
    }),
    {
      name: STORAGE_KEY,
      // Version 1 introduced `city-explorer-trips`. Data still stored under the
      // legacy key is read once, converted in `merge` and written to the new key.
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (name) => localStorage.getItem(name) ?? localStorage.getItem(LEGACY_STORAGE_KEY),
        setItem: (name, value) => {
          localStorage.setItem(name, value)
          localStorage.removeItem(LEGACY_STORAGE_KEY)
        },
        removeItem: (name) => localStorage.removeItem(name),
      })),
      migrate: (persisted) => persisted as PersistedChatState,
      partialize: (state): PersistedChatState => {
        const persisted: PersistedChatState = {
          trips: state.trips,
          activeId: state.activeId,
        }
        if (state.langChosen) persisted.lang = state.lang
        if (state.darkChosen) persisted.dark = state.dark
        return persisted
      },
      merge: (persisted, current) => {
        const data = persisted && typeof persisted === "object" ? (persisted as Partial<PersistedChatState> & { chats?: unknown }) : {}
        const savedLang = data.lang === "ru" || data.lang === "en" ? data.lang : null
        const savedDark = typeof data.dark === "boolean" ? data.dark : null
        const activeId = typeof data.activeId === "string" || data.activeId === null ? data.activeId : current.activeId
        const saved = Array.isArray(data.trips) ? { items: data.trips as unknown[], parse: parseTrip } : Array.isArray(data.chats) ? { items: data.chats, parse: parseLegacyChat } : null
        return {
          ...current,
          lang: current.langChosen ? current.lang : (savedLang ?? systemLang()),
          dark: current.darkChosen ? current.dark : (savedDark ?? prefersDark()),
          langChosen: current.langChosen || savedLang !== null,
          darkChosen: current.darkChosen || savedDark !== null,
          activeId,
          trips: saved
            ? saved.items.flatMap((item) => {
                const trip = saved.parse(item)
                return trip ? [trip] : []
              })
            : current.trips,
        }
      },
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) {
          useChatStore.setState({ hasHydrated: true })
          return
        }
        document.documentElement.classList.toggle("dark", state.dark)
        document.documentElement.lang = state.lang
        state.setHasHydrated(true)
      },
    },
  ),
)
