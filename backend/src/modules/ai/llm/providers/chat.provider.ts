import type { ChatCompletion, ModelMessage, ToolDefinition } from "@/modules/ai/llm/chat.types"

export interface ChatProvider {
  complete(messages: ModelMessage[], tools?: ToolDefinition[]): Promise<ChatCompletion>
}
