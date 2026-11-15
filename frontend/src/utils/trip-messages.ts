import type { ChatMessage } from "@/types/chat"

/** Messages the assistant has not answered yet: everything after its last reply. */
export function unanswered(messages: ChatMessage[]) {
  const lastReply = messages.findLastIndex((message) => message.role === "ai")
  return messages.slice(lastReply + 1)
}

/** A conversation waits for the assistant when it is empty (the first itinerary) or does not end with its reply. */
export function needsReply(messages: ChatMessage[]) {
  return messages.at(-1)?.role !== "ai"
}
