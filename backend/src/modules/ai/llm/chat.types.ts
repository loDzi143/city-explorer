export const chatRoles = ["system", "user", "assistant"] as const

export type ChatRole = (typeof chatRoles)[number]

export type ChatMessage = {
  role: ChatRole
  content: string
}

export type LlmUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type ChatCompletion = {
  content: string
  usage?: LlmUsage
}

export type ChatLlmInput = {
  messages: ChatMessage[]
}
