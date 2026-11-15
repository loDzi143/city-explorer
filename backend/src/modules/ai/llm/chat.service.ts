import { logger } from "@/infrastructure/logging/logger"
import { parseChatCompletion } from "@/modules/ai/llm/chat.schemas"
import type { ChatCompletion, ModelMessage, ToolDefinition } from "@/modules/ai/llm/chat.types"
import { LlmError } from "@/modules/ai/llm/llm-error"
import type { ChatProvider, CompletionOptions } from "@/modules/ai/llm/providers/chat.provider"
import { openRouterProvider } from "@/modules/ai/llm/providers/openrouter.provider"

const ATTEMPTS = 3

// Some upstream providers of DeepSeek models fail to convert the model's native tool-call markup
// ("<｜DSML｜ invoke …>") into `tool_calls` and return it as text. Such a reply is unusable but
// the same request usually succeeds on the next attempt (OpenRouter routes it again).
const RAW_TOOL_MARKUP = /<\/?\s*[｜|]\s*DSML\s*[｜|]/

/** The reply is the model's tool-call markup as plain text, not an answer. */
export function hasRawToolMarkup(content: string | null) {
  return Boolean(content && RAW_TOOL_MARKUP.test(content))
}

function check(completion: Awaited<ReturnType<ChatProvider["complete"]>>, options: CompletionOptions | undefined): ChatCompletion {
  const parsed = parseChatCompletion(completion)
  if (!parsed) throw new LlmError("OpenRouter response is invalid", { retryable: true })
  // With tool_choice "none" the markup is the model insisting on a tool call; the caller handles it.
  if (options?.toolChoice !== "none" && parsed.toolCalls.length === 0 && hasRawToolMarkup(parsed.content)) {
    throw new LlmError("OpenRouter response contains an unparsed tool call", { retryable: true })
  }
  return parsed
}

export function createChatService(provider: ChatProvider = openRouterProvider, options: { retryDelayMs?: number } = {}) {
  const retryDelayMs = options.retryDelayMs ?? 500

  return {
    /** One completion; retried when the upstream fails transiently or returns a garbled reply. */
    async complete(messages: ModelMessage[], tools?: ToolDefinition[], completionOptions?: CompletionOptions): Promise<ChatCompletion> {
      for (let attempt = 1; ; attempt += 1) {
        if (completionOptions?.deadline !== undefined && Date.now() >= completionOptions.deadline) {
          throw new LlmError("LLM reply timed out", { retryable: false })
        }
        try {
          return check(await provider.complete(messages, tools, completionOptions), completionOptions)
        } catch (error) {
          if (!(error instanceof LlmError) || !error.retryable || attempt >= ATTEMPTS) throw error
          logger.warn(`LLM attempt ${attempt} of ${ATTEMPTS} failed, retrying`, error)
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
        }
      }
    },
  }
}

export const chatService = createChatService()
