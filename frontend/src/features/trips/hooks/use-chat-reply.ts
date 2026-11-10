import { useCallback, useEffect } from "react"

import type { Chat } from "@/types/chat"
import type { Lang } from "@/types/lang"

import { chatLlm } from "../api/chat-llm"
import { chatHistory } from "../utils/chat-history"
import { messageWithItinerary } from "../utils/itinerary-message"

function needsReply(chat: Chat) {
  const messages = chat.messages
  if (!messages) return false
  if (messages.length === 0) return true
  const role = messages[messages.length - 1]?.role
  return role === "user" || role === "system"
}

export function useChatReply({
  chat,
  lang,
  enabled,
  onBegin,
  onFinish,
  onError,
}: {
  chat: Chat
  lang: Lang
  enabled: boolean
  onBegin: () => number | null
  onFinish: (text: string, token: number) => void
  onError: (token?: number) => void
}) {
  const send = useCallback(() => {
    if (!enabled || !needsReply(chat)) return
    const place = chat.place
    if (!place) {
      onError()
      return
    }
    const token = onBegin()
    if (token == null) return
    chatLlm(chatHistory(chat, lang), {
      city: place.city,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
    })
      .then((reply) => {
        const message = messageWithItinerary(reply.message, reply.days, lang)
        onFinish(JSON.stringify({ ...reply, message }), token)
      })
      .catch(() => onError(token))
  }, [chat, enabled, lang, onBegin, onError, onFinish])

  useEffect(() => {
    send()
  }, [send])

  const retry = useCallback(() => {
    send()
  }, [send])

  return { retry }
}
