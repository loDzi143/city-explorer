import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { Chat, ChatMessage, TripDay, TripDetails } from "@/types/chat"
import type { Lang } from "@/types/lang"
import { isPlace, tripPlace } from "@/utils/place"

type ChatState = {
  hasHydrated: boolean
  lang: Lang
  dark: boolean
  chats: Chat[]
  activeId: string | null
  setHasHydrated: (hasHydrated: boolean) => void
  setLang: (lang: Lang) => void
  setDark: (dark: boolean) => void
  createChat: () => void
  selectChat: (id: string) => void
  renameChat: (id: string, name: string) => void
  deleteChat: (id: string) => void
  saveTrip: (id: string, value: TripDetails) => void
  sendMessage: (id: string, text: string) => void
  pendingItineraryIds: string[]
  failedItineraryIds: string[]
  beginItinerary: (id: string) => boolean
  finishItinerary: (id: string, text: string) => void
  failItinerary: (id: string) => void
}

type PersistedChatState = Pick<ChatState, "lang" | "dark" | "chats" | "activeId">

const repliesInFlight = new Set<string>()

function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false
  const message = value as ChatMessage
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "ai") &&
    typeof message.text?.en === "string" &&
    typeof message.text?.ru === "string"
  )
}

function parseChat(value: unknown): Chat | null {
  if (!value || typeof value !== "object") return null
  const chat = value as Chat & { place?: unknown }
  const messagesOk = chat.messages === null || (Array.isArray(chat.messages) && chat.messages.every(isMessage))
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
    tripDays: readTripDays(chat.tripDays),
  }
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

function needsReply(messages: ChatMessage[]) {
  if (messages.length === 0) return true
  return messages[messages.length - 1]?.role === "user"
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
      lang: "en",
      dark: prefersDark(),
      chats: [],
      activeId: null,
      pendingItineraryIds: [],
      failedItineraryIds: [],
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setLang: (lang) => set({ lang }),
      setDark: (dark) => set({ dark }),
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
      saveTrip: (id, value) =>
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === id ? { ...chat, ...value, messages: chat.messages ?? [] } : chat,
          ),
        })),
      sendMessage: (id, text) => {
        const trimmed = text.trim()
        if (!trimmed) return
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          text: { en: trimmed, ru: trimmed },
        }
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === id ? { ...chat, messages: [...(chat.messages ?? []), message] } : chat,
          ),
        }))
      },
      beginItinerary: (id) => {
        const chat = get().chats.find((item) => item.id === id)
        if (!chat || chat.messages === null || !needsReply(chat.messages) || repliesInFlight.has(id)) return false
        repliesInFlight.add(id)
        set((state) => ({
          pendingItineraryIds: state.pendingItineraryIds.includes(id) ? state.pendingItineraryIds : [...state.pendingItineraryIds, id],
          failedItineraryIds: state.failedItineraryIds.filter((item) => item !== id),
        }))
        return true
      },
      finishItinerary: (id, text) => {
        repliesInFlight.delete(id)
        const reply: ChatMessage = {
          id: crypto.randomUUID(),
          role: "ai",
          text: { en: text, ru: text },
        }
        const incoming = daysFromReply(text)
        set((state) => ({
          pendingItineraryIds: state.pendingItineraryIds.filter((item) => item !== id),
          failedItineraryIds: state.failedItineraryIds.filter((item) => item !== id),
          chats: state.chats.map((chat) => {
            if (chat.id !== id || chat.messages === null) return chat
            return {
              ...chat,
              messages: [...chat.messages, reply],
              tripDays: incoming.length > 0 ? incoming : chat.tripDays,
            }
          }),
        }))
      },
      failItinerary: (id) => {
        repliesInFlight.delete(id)
        set((state) => ({
          pendingItineraryIds: state.pendingItineraryIds.filter((item) => item !== id),
          failedItineraryIds: state.failedItineraryIds.includes(id) ? state.failedItineraryIds : [...state.failedItineraryIds, id],
        }))
      },
    }),
    {
      name: "city-explorer-chats",
      partialize: (state): PersistedChatState => ({
        chats: state.chats,
        activeId: state.activeId,
        lang: state.lang,
        dark: state.dark,
      }),
      merge: (persisted, current) => {
        const data = persisted && typeof persisted === "object" ? (persisted as Partial<PersistedChatState>) : {}
        const activeId = typeof data.activeId === "string" || data.activeId === null ? data.activeId : current.activeId
        return {
          ...current,
          lang: data.lang === "ru" || data.lang === "en" ? data.lang : current.lang,
          dark: typeof data.dark === "boolean" ? data.dark : current.dark,
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
