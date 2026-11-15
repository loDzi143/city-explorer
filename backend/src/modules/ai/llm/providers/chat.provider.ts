import type { ChatCompletion, ModelMessage, ToolDefinition } from "@/modules/ai/llm/chat.types"

export type CompletionOptions = {
  /** "none" keeps the tools described (the history may contain tool calls) but asks for a text answer. */
  toolChoice?: "auto" | "none"
  /** Epoch milliseconds after which the answer is no longer needed: no request or retry starts past it. */
  deadline?: number
}

export interface ChatProvider {
  complete(messages: ModelMessage[], tools?: ToolDefinition[], options?: CompletionOptions): Promise<ChatCompletion>
}
