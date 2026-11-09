import { z } from "zod"

import { api } from "@/lib/api"

const coordinatesSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
})

const agentResponseSchema = z.object({
  message: z.string().min(1),
  days: z.array(
    z.object({
      date: z.string(),
      places: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          description: z.string().optional().transform((value) => value ?? ""),
          coordinates: coordinatesSchema,
        }),
      ),
    }),
  ),
})

export type AgentResponse = z.infer<typeof agentResponseSchema>

export type ChatLlmMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type ChatDestination = {
  city: string
  country: string
  latitude: number
  longitude: number
}

export async function chatLlm(messages: ChatLlmMessage[], destination: ChatDestination) {
  const { data } = await api.post("/api/chat-llm", { messages, destination })
  return agentResponseSchema.parse(data)
}
