// Test-only: a scripted stand-in for OpenRouter that records every request.
import type { ChatCompletion, ModelMessage, ToolDefinition } from "@/modules/ai/llm/chat.types"
import type { ChatProvider } from "@/modules/ai/llm/providers/chat.provider"

type Step = ChatCompletion | Error | ((messages: ModelMessage[]) => ChatCompletion | Promise<ChatCompletion>)

export function createFakeChatProvider() {
  const queue: Step[] = []
  const requests: { messages: ModelMessage[]; tools?: ToolDefinition[] }[] = []

  const provider: ChatProvider = {
    async complete(messages, tools) {
      requests.push({ messages: structuredClone(messages), tools })
      const step = queue.shift()
      if (!step) throw new Error("Fake chat provider has no scripted reply")
      if (step instanceof Error) throw step
      return typeof step === "function" ? step(messages) : step
    },
  }

  return {
    provider,
    requests,
    /** Queues a final JSON reply from the model. */
    replyWith(reply: Record<string, unknown>) {
      queue.push({ content: JSON.stringify(reply), toolCalls: [] })
    },
    push(step: Step) {
      queue.push(step)
    },
    reset() {
      queue.length = 0
      requests.length = 0
    },
  }
}

/** Shared instance for tests that replace the OpenRouter module with vi.mock. */
export const fakeChat = createFakeChatProvider()
