import type { ChatMessage, Trip } from "@/types/chat"
import type { Lang } from "@/types/lang"

import type { ChatLlmMessage } from "../api/chat-llm"
import { systemPrompt } from "./system-prompt"

/** Messages the model has not answered yet: everything after its last reply. */
function unansweredMessages(messages: ChatMessage[]) {
  const lastReply = messages.findLastIndex((message) => message.role === "ai")
  return messages.slice(lastReply + 1)
}

/**
 * The model gets no chat history. Each request carries the system prompt with the
 * current trip settings and itinerary, the conversationContext from the previous
 * reply, and the messages written since that reply.
 */
export function chatRequest(trip: Trip, lang: Lang): ChatLlmMessage[] {
  const messages = trip.messages ?? []
  const isInitialRequest = !messages.some((message) => message.role === "ai")

  const turns: ChatLlmMessage[] = unansweredMessages(messages).map((message) => ({
    role: message.role === "user" ? "user" : "system",
    content: message.text,
  }))

  const prompt = systemPrompt(trip, lang, {
    isInitialRequest,
    conversationContext: isInitialRequest ? null : trip.conversationContext,
  })

  return [{ role: "system", content: prompt }, ...turns]
}
