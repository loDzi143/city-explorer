import { z } from "zod"

import { chatRoles, type ChatCompletion } from "@/modules/ai/llm/chat.types"

const chatMessageSchema = z.object({
  role: z.enum(chatRoles),
  content: z.string().trim().min(1).max(20_000),
})

export const chatMessagesSchema = z.array(chatMessageSchema).min(1).max(100)

const toolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.string(),
})

const llmUsageSchema = z.object({
  promptTokens: z.number().finite().nonnegative(),
  completionTokens: z.number().finite().nonnegative(),
  totalTokens: z.number().finite().nonnegative(),
})

export function parseChatCompletion(payload: {
  content: string | null
  toolCalls: unknown
  usage?: unknown
}): ChatCompletion | null {
  const toolCalls = z.array(toolCallSchema).safeParse(payload.toolCalls)
  if (!toolCalls.success) return null

  let text: string | null = null
  if (payload.content !== null) {
    const content = z.string().trim().min(1).safeParse(payload.content)
    if (!content.success) return null
    text = content.data
  }
  if (!text && toolCalls.data.length === 0) return null
  const usage = llmUsageSchema.safeParse(payload.usage)
  return usage.success
    ? { content: text, toolCalls: toolCalls.data, usage: usage.data }
    : { content: text, toolCalls: toolCalls.data }
}
