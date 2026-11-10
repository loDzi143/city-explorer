import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { Chat, ChatMessage, TripDay, TripDetails } from "@/types/chat"
import type { Lang } from "@/types/lang"
import { isPlace, tripPlace } from "@/utils/place"

type ChatState = {
  hasHydrated: boolean
  lang: Lang
  dark: boolean
  langChosen: boolean
  darkChosen: boolean
  chats: Chat[]
  activeId: string | null
  setHasHydrated: (hasHydrated: boolean) => void
  setLang: (lang: Lang) => void
  setDark: (dark: boolean) => void
  followSystemLang: () => void
  followSystemDark: () => void
  createChat: () => void
  selectChat: (id: string) => void
  renameChat: (id: string, name: string) => void
  deleteChat: (id: string) => void
  saveTrip: (id: string, value: TripDetails, notice?: string | null) => void
  sendMessage: (id: string, text: string) => void
  pendingItineraryIds: string[]
  failedItineraryIds: string[]
  beginItinerary: (id: string) => number | null
  finishItinerary: (id: string, text: string, token: number) => void
  failItinerary: (id: string, token?: number) => void
}

type PersistedChatState = Pick<ChatState, "chats" | "activeId"> & {
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
  const message = value as { id?: unknown; role?: unknown; text?: unknown }
  const text = readMessageText(message.text)
  if (typeof message.id !== "string" || text === null) return null
  if (message.role !== "user" && message.role !== "ai" && message.role !== "system") return null
  return { id: message.id, role: message.role, text }
}

function parseChat(value: unknown): Chat | null {
  if (!value || typeof value !== "object") return null
  const chat = value as Chat & { place?: unknown }
  const messages = readMessages(chat.messages)
  const messagesOk = messages !== undefined
  const valid =
    typeof chat.id === "string" &&
    (typeof chat.cityId === "string" || chat.cityId === null) &&
    (typeof chat.start === "string" || chat.start === null) &&
    (typeof chat.end === "string" || chat.end === null) &&
    typeof chat.hotel === "string" &&
    typeof chat.prefs === "string" &&
    (chat.name === undefined || typeof chat.name === "string") &&
    messagesOk
  if (!valid) return null
  return {
    ...chat,
    place: isPlace(chat.place) ? chat.place : null,
    messages: messages ?? null,
    tripDays: readTripDays(chat.tripDays),
    hints: readHints(chat.hints),
  }
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

function daysFromReply(text: string): TripDay[] {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return []
  }
  if (!payload || typeof payload !== "object" || !("days" in payload)) return []
  return readTripDays(payload.days)
}

function hintsFromReply(text: string): string[] {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return []
  }
  if (!payload || typeof payload !== "object" || !("hints" in payload)) return []
  return readHints(payload.hints)
}

function needsReply(messages: ChatMessage[]) {
  if (messages.length === 0) return true
  const role = messages[messages.length - 1]?.role
  return role === "user" || role === "system"
}

export function chatTitle(chat: Chat, t: { untitled: string }) {
  const custom = chat.name?.trim()
  if (custom) return custom
  const place = tripPlace(chat)
  return place ? place.city : t.untitled
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      lang: systemLang(),
      dark: prefersDark(),
      langChosen: false,
      darkChosen: false,
      chats: [],
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
      createChat: () => {
        const chat: Chat = {
          id: crypto.randomUUID(),
          cityId: null,
          place: null,
          start: null,
          end: null,
          hotel: "",
          prefs: "",
          messages: null,
          tripDays: [],
          hints: [],
        }
        set((state) => ({ chats: [chat, ...state.chats], activeId: chat.id }))
      },
      selectChat: (id) => set({ activeId: id }),
      renameChat: (id, name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        set((state) => ({
          chats: state.chats.map((chat) => (chat.id === id ? { ...chat, name: trimmed } : chat)),
        }))
      },
      deleteChat: (id) =>
        set((state) => {
          const chats = state.chats.filter((chat) => chat.id !== id)
          const activeId = state.activeId === id ? (chats[0]?.id ?? null) : state.activeId
          return { chats, activeId }
        }),
      saveTrip: (id, value, notice) => {
        const text = notice?.trim() ?? ""
        if (text) invalidateReply(id)
        const system: ChatMessage | null = text
          ? { id: crypto.randomUUID(), role: "system", text }
          : null
        set((state) => ({
          chats: state.chats.map((chat) => {
            if (chat.id !== id) return chat
            const messages = chat.messages ?? []
            return { ...chat, ...value, messages: system ? [...messages, system] : messages }
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
          chats: state.chats.map((chat) =>
            chat.id === id ? { ...chat, messages: [...(chat.messages ?? []), message] } : chat,
          ),
        }))
      },
      beginItinerary: (id) => {
        const chat = get().chats.find((item) => item.id === id)
        if (!chat || chat.messages === null || !needsReply(chat.messages) || repliesInFlight.has(id)) return null
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
        const incoming = daysFromReply(text)
        const hints = hintsFromReply(text)
        set((state) => ({
          pendingItineraryIds: state.pendingItineraryIds.filter((item) => item !== id),
          failedItineraryIds: state.failedItineraryIds.filter((item) => item !== id),
          chats: state.chats.map((chat) => {
            if (chat.id !== id || chat.messages === null) return chat
            return {
              ...chat,
              messages: [...chat.messages, reply],
              tripDays: incoming.length > 0 ? incoming : chat.tripDays,
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
      name: "city-explorer-chats",
      partialize: (state): PersistedChatState => {
        const persisted: PersistedChatState = {
          chats: state.chats,
          activeId: state.activeId,
        }
        if (state.langChosen) persisted.lang = state.lang
        if (state.darkChosen) persisted.dark = state.dark
        return persisted
      },
      merge: (persisted, current) => {
        const data = persisted && typeof persisted === "object" ? (persisted as Partial<PersistedChatState>) : {}
        const savedLang = data.lang === "ru" || data.lang === "en" ? data.lang : null
        const savedDark = typeof data.dark === "boolean" ? data.dark : null
        const activeId = typeof data.activeId === "string" || data.activeId === null ? data.activeId : current.activeId
        return {
          ...current,
          lang: current.langChosen ? current.lang : savedLang ?? systemLang(),
          dark: current.darkChosen ? current.dark : savedDark ?? prefersDark(),
          langChosen: current.langChosen || savedLang !== null,
          darkChosen: current.darkChosen || savedDark !== null,
          activeId,
          chats: Array.isArray(data.chats) ? data.chats.flatMap((item) => {
            const chat = parseChat(item)
            return chat ? [chat] : []
          }) : current.chats,
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
