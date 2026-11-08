import type { ChatCompletion, ChatMessage } from "@/modules/ai/llm/chat.types"

export interface ChatProvider {
  complete(messages: ChatMessage[]): Promise<ChatCompletion>
}
