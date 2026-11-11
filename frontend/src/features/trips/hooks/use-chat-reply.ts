import { useCallback, useEffect } from "react"

import type { Trip } from "@/types/chat"
import type { Lang } from "@/types/lang"

import { chatLlm } from "../api/chat-llm"
import { chatHistory } from "../utils/chat-history"

function needsReply(trip: Trip) {
  const messages = trip.messages
  if (!messages) return false
  if (messages.length === 0) return true
  const role = messages[messages.length - 1]?.role
  return role === "user" || role === "system"
}

export function useChatReply({
  trip,
  lang,
  enabled,
  onBegin,
  onFinish,
  onError,
}: {
  trip: Trip
  lang: Lang
  enabled: boolean
  onBegin: () => number | null
  onFinish: (text: string, token: number) => void
  onError: (token?: number) => void
}) {
  const send = useCallback(() => {
    if (!enabled || !needsReply(trip)) return
    const place = trip.place
    if (!place) {
      onError()
      return
    }
    const token = onBegin()
    if (token == null) return
    chatLlm(chatHistory(trip, lang), {
      city: place.city,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
    })
      .then((reply) => onFinish(JSON.stringify(reply), token))
      .catch(() => onError(token))
  }, [trip, enabled, lang, onBegin, onError, onFinish])

  useEffect(() => {
    send()
  }, [send])

  const retry = useCallback(() => {
    send()
  }, [send])

  return { retry }
}
