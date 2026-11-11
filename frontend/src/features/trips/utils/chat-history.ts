import type { Trip } from "@/types/chat"
import type { Lang } from "@/types/lang"

import type { ChatLlmMessage } from "../api/chat-llm"
import { systemPrompt } from "./system-prompt"

export function chatHistory(trip: Trip, lang: Lang): ChatLlmMessage[] {
  const turns: ChatLlmMessage[] = (trip.messages ?? []).map((message) => ({
    role: message.role === "user" ? "user" : message.role === "system" ? "system" : "assistant",
    content: message.text,
  }))

  return [{ role: "system", content: systemPrompt(trip, lang) }, ...turns]
}
