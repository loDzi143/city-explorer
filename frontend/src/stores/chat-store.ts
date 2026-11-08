import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { Chat, ChatMessage, TripDetails } from "@/types/chat"
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
  appendAiReply: (id: string) => void
}

type PersistedChatState = Pick<ChatState, "lang" | "dark" | "chats" | "activeId">

const AI_REPLY: Record<Lang, string> = {
  en: "AI answer",
  ru: "AI ответ",
}

const AI_REPLY_DELAY_MS = 800
const recoveredChatIds = new Set<string>()

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
  return { ...chat, place: isPlace(chat.place) ? chat.place : null }
}

function scheduleAiReply(chatId: string) {
  window.setTimeout(() => {
    useChatStore.getState().appendAiReply(chatId)
  }, AI_REPLY_DELAY_MS)
}

function recoverPendingReplies(chats: Chat[]) {
  for (const chat of chats) {
    if (recoveredChatIds.has(chat.id)) continue
    const messages = chat.messages
    if (!messages?.length || messages[messages.length - 1]?.role !== "user") continue
    recoveredChatIds.add(chat.id)
    let pending = 0
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role !== "user") break
      pending += 1
    }
    for (let count = 0; count < pending; count += 1) scheduleAiReply(chat.id)
  }
}

export function chatTitle(chat: Chat, t: { untitled: string }) {
  const custom = chat.name?.trim()
  if (custom) return custom
  const place = tripPlace(chat)
  return place ? place.city : t.untitled
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      lang: "en",
      dark: prefersDark(),
      chats: [],
      activeId: null,
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
        scheduleAiReply(id)
      },
      appendAiReply: (id) =>
        set((state) => ({
          chats: state.chats.map((chat) => {
            if (chat.id !== id || chat.messages === null) return chat
            const reply: ChatMessage = {
              id: crypto.randomUUID(),
              role: "ai",
              text: AI_REPLY,
            }
            return { ...chat, messages: [...chat.messages, reply] }
          }),
        })),
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
        recoverPendingReplies(state.chats)
        state.setHasHydrated(true)
      },
    },
  ),
)
