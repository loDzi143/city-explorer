import { z } from "zod"

import { api } from "@/lib/api"

const completionSchema = z.object({
  content: z.string().min(1),
})

export type ChatLlmMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export async function chatLlm(messages: ChatLlmMessage[]) {
  const { data } = await api.post("/api/chat-llm", { messages })
  return completionSchema.parse(data).content
}
