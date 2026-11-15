import { readEnv } from "@/config/env"
import type { ChatCompletion, LlmUsage, ModelMessage, ToolCall, ToolDefinition } from "@/modules/ai/llm/chat.types"
import { LlmError } from "@/modules/ai/llm/llm-error"
import type { ChatProvider, CompletionOptions } from "@/modules/ai/llm/providers/chat.provider"
import { isRecord } from "@/shared/lib/is-record"

// Reasoning models routed through OpenRouter can take a minute on a long prompt before the first token.
const REQUEST_TIMEOUT_MS = 120_000

export const openRouterProvider: ChatProvider = {
  async complete(messages: ModelMessage[], tools: ToolDefinition[] = [], options: CompletionOptions = {}): Promise<ChatCompletion> {
    const {
      OPENROUTER_API_KEY: key,
      OPENROUTER_MODEL: model,
      OPENROUTER_COMPLETIONS_URL: url,
    } = readEnv()
    if (!key) {
      throw new LlmError("OPENROUTER_API_KEY is not configured", { retryable: false })
    }
    if (!model) {
      throw new LlmError("OPENROUTER_MODEL is not configured", { retryable: false })
    }
    if (!url) {
      throw new LlmError("OPENROUTER_COMPLETIONS_URL is not configured", { retryable: false })
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: messages.map(toApiMessage),
          ...(tools.length > 0 ? { tools: tools.map(toApiTool), tool_choice: options.toolChoice ?? "auto" } : {}),
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(requestTimeout(options.deadline)),
      })
    } catch (error) {
      const message = isTimeoutError(error) ? "OpenRouter request timed out" : "OpenRouter request failed: network error"
      throw new LlmError(message, { retryable: true })
    }

    if (!response.ok) {
      const detail = safeErrorDetail(await response.text().catch(() => ""))
      const message = detail
        ? `OpenRouter request failed with status ${response.status}: ${detail}`
        : `OpenRouter request failed with status ${response.status}`
      // Rate limits and upstream failures pass; a bad request, key or credit balance does not.
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500
      throw new LlmError(message, { retryable, status: response.status === 400 ? 400 : 502 })
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new LlmError("OpenRouter response is invalid", { retryable: true })
    }

    const message = completionMessage(payload)
    if (!message) {
      throw new LlmError(`OpenRouter response is empty${errorSuffix(payload)}`, { retryable: true })
    }
    const content = textContent(message.content)
    const toolCalls = toolCallsOf(message)
    if (!content && toolCalls.length === 0) {
      throw new LlmError(`OpenRouter response is empty${errorSuffix(payload)}`, { retryable: true })
    }
    return { content, toolCalls, usage: completionUsage(payload) }
  },
}

/** The per-request timeout, shortened when the caller's overall deadline is closer. */
function requestTimeout(deadline: number | undefined) {
  if (deadline === undefined) return REQUEST_TIMEOUT_MS
  return Math.max(1, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()))
}

/** OpenRouter reports some upstream failures inside a 200 response. */
function errorSuffix(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.error)) return ""
  return typeof payload.error.message === "string" ? `: ${safeErrorDetail(payload.error.message)}` : ""
}

function toApiMessage(message: ModelMessage) {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      name: message.name,
      content: message.content,
    }
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: call.arguments,
        },
      })),
    }
  }
  return {
    role: message.role,
    content: message.content ?? "",
  }
}

function toApiTool(tool: ToolDefinition) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === "TimeoutError") return true
  return error.name === "AbortError" && error.cause instanceof Error && error.cause.name === "TimeoutError"
}

function safeErrorDetail(body: string): string {
  let message = body
  try {
    const payload = JSON.parse(body) as unknown
    if (isRecord(payload)) {
      if (typeof payload.error === "string") message = payload.error
      else if (isRecord(payload.error) && typeof payload.error.message === "string") message = payload.error.message
      else if (typeof payload.message === "string") message = payload.message
    }
  } catch {
    message = body
  }
  return message
    .replace(/sk-or-[a-z0-9_-]+/gi, "[redacted]")
    .replace(/bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
}

function completionUsage(payload: unknown): LlmUsage | undefined {
  if (!isRecord(payload) || !isRecord(payload.usage)) return undefined
  const promptTokens = finiteNumber(payload.usage.prompt_tokens)
  const completionTokens = finiteNumber(payload.usage.completion_tokens)
  const totalTokens = finiteNumber(payload.usage.total_tokens)
  if (promptTokens === null || completionTokens === null || totalTokens === null) return undefined
  return { promptTokens, completionTokens, totalTokens }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
}

function completionMessage(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null
  const choice = payload.choices[0]
  if (!isRecord(choice) || !isRecord(choice.message)) return null
  return choice.message
}

function toolCallsOf(message: Record<string, unknown>): ToolCall[] {
  if (!Array.isArray(message.tool_calls)) return []
  return message.tool_calls.flatMap((call, index) => {
    const parsed = toolCallOf(call, index)
    return parsed ? [parsed] : []
  })
}

function toolCallOf(call: unknown, index: number): ToolCall | null {
  if (!isRecord(call)) return null
  const fn = isRecord(call.function) ? call.function : call
  const name = textField(fn.name) || textField(call.name)
  if (!name) return null
  const id = textField(call.id) || `call_${index}`
  const raw = "arguments" in fn ? fn.arguments : call.arguments
  const args = typeof raw === "string" ? raw : isRecord(raw) || Array.isArray(raw) ? JSON.stringify(raw) : ""
  return { id, name, arguments: args }
}

function textField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function textContent(content: unknown): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim()
    return trimmed || null
  }
  if (!Array.isArray(content)) return null
  const text = content
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim()
  return text || null
}
