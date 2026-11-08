import { AppError } from "@/shared/errors/app-error"
import { parseChatCompletion } from "@/modules/ai/llm/chat.schemas"
import type { ChatCompletion, ChatMessage } from "@/modules/ai/llm/chat.types"
import type { ChatProvider } from "@/modules/ai/llm/providers/chat.provider"
import { openRouterProvider } from "@/modules/ai/llm/providers/openrouter.provider"

export function createChatService(provider: ChatProvider = openRouterProvider) {
  return {
    async complete(messages: ChatMessage[]): Promise<ChatCompletion> {
      const completion = await provider.complete(messages)
      const parsed = parseChatCompletion(completion)
      if (!parsed) {
        throw new AppError("OpenRouter response is invalid", 502, "LLM is unavailable")
      }
      return parsed
    },
  }
}

export const chatService = createChatService()
