import type { Chat } from "@/types/chat"
import type { Lang } from "@/types/lang"

import type { ChatLlmMessage } from "../api/chat-llm"
import { systemPrompt } from "./system-prompt"

export function chatHistory(chat: Chat, lang: Lang): ChatLlmMessage[] {
  const turns: ChatLlmMessage[] = (chat.messages ?? []).map((message) => ({
    role: message.role === "user" ? "user" : "assistant",
    content: message.text[lang],
  }))

  return [{ role: "system", content: systemPrompt(chat, lang) }, ...turns]
}
