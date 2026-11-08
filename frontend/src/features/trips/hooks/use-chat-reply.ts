import { useCallback, useEffect } from "react"

import type { Chat } from "@/types/chat"
import type { Lang } from "@/types/lang"

import { chatLlm } from "../api/chat-llm"
import { chatHistory } from "../utils/chat-history"

function needsReply(chat: Chat) {
  const messages = chat.messages
  if (!messages) return false
  if (messages.length === 0) return true
  return messages[messages.length - 1]?.role === "user"
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
  onBegin: () => boolean
  onFinish: (text: string) => void
  onError: () => void
}) {
  const send = useCallback(() => {
    chatLlm(chatHistory(chat, lang)).then(onFinish).catch(onError)
  }, [chat, lang, onFinish, onError])

  useEffect(() => {
    if (!enabled || !needsReply(chat)) return
    if (!onBegin()) return
    send()
  }, [chat, enabled, onBegin, send])

  const retry = useCallback(() => {
    if (!enabled || !needsReply(chat)) return
    if (!onBegin()) return
    send()
  }, [chat, enabled, onBegin, send])

  return { retry }
}
