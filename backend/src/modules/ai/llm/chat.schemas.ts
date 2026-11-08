import { z } from "zod"

import { chatRoles, type ChatCompletion, type ChatLlmInput } from "@/modules/ai/llm/chat.types"

const chatMessageSchema = z.object({
  role: z.enum(chatRoles),
  content: z.string().trim().min(1).max(20_000),
})

export const chatLlmBodySchema = z
  .object({
    messages: z.array(chatMessageSchema).min(1).max(100),
  })
  .refine((value) => value.messages[0]?.role === "system")

const llmUsageSchema = z.object({
  promptTokens: z.number().finite().nonnegative(),
  completionTokens: z.number().finite().nonnegative(),
  totalTokens: z.number().finite().nonnegative(),
})

export const chatCompletionSchema = z.object({
  content: z.string().trim().min(1),
  usage: llmUsageSchema.optional(),
})

export function parseChatLlmBody(payload: unknown): { ok: true; data: ChatLlmInput } | { ok: false; error: string } {
  const result = chatLlmBodySchema.safeParse(payload)
  if (!result.success) {
    const tooLong = result.error.issues.some((issue) => issue.code === "too_big")
    return { ok: false, error: tooLong ? "Message is too long" : "Message is required" }
  }
  return { ok: true, data: result.data }
}

export function parseChatCompletion(payload: { content: string; usage?: unknown }): ChatCompletion | null {
  const content = z.string().trim().min(1).safeParse(payload.content)
  if (!content.success) return null
  const usage = llmUsageSchema.safeParse(payload.usage)
  return usage.success ? { content: content.data, usage: usage.data } : { content: content.data }
}
