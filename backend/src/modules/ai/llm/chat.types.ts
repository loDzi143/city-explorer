export const chatRoles = ["system", "user", "assistant"] as const

export type ChatRole = (typeof chatRoles)[number]

export type ChatMessage = {
  role: ChatRole
  content: string
}

export type ToolCall = {
  id: string
  name: string
  arguments: string
}

export type ToolDefinition = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string }

export type LlmUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type ChatCompletion = {
  content: string | null
  toolCalls: ToolCall[]
  usage?: LlmUsage
}
