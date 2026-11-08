import { readEnv } from "@/config/env"
import type { ChatCompletion, ChatMessage, LlmUsage } from "@/modules/ai/llm/chat.types"
import type { ChatProvider } from "@/modules/ai/llm/providers/chat.provider"
import { AppError } from "@/shared/errors/app-error"

export const openRouterProvider: ChatProvider = {
  async complete(messages: ChatMessage[]): Promise<ChatCompletion> {
    const {
      OPENROUTER_API_KEY: key,
      OPENROUTER_MODEL: model,
      OPENROUTER_COMPLETIONS_URL: url,
    } = readEnv()
    if (!key) {
      throw new AppError("OPENROUTER_API_KEY is not configured", 502, "LLM is unavailable")
    }
    if (!model) {
      throw new AppError("OPENROUTER_MODEL is not configured", 502, "LLM is unavailable")
    }
    if (!url) {
      throw new AppError("OPENROUTER_COMPLETIONS_URL is not configured", 502, "LLM is unavailable")
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
          messages,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      })
    } catch (error) {
      const message = isTimeoutError(error) ? "OpenRouter request timed out" : "OpenRouter request failed: network error"
      throw new AppError(message, 502, "LLM is unavailable")
    }

    if (!response.ok) {
      const detail = safeErrorDetail(await response.text().catch(() => ""))
      const message = detail
        ? `OpenRouter request failed with status ${response.status}: ${detail}`
        : `OpenRouter request failed with status ${response.status}`
      throw new AppError(message, response.status === 400 ? 400 : 502, "LLM is unavailable")
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new AppError("OpenRouter response is invalid", 502, "LLM is unavailable")
    }

    const content = completionText(payload)
    if (!content) {
      throw new AppError("OpenRouter response is empty", 502, "LLM is unavailable")
    }
    return { content, usage: completionUsage(payload) }
  },
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

function completionText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null
  const choice = payload.choices[0]
  if (!isRecord(choice) || !isRecord(choice.message)) return null
  return textContent(choice.message.content)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
