import { AppError } from "@/shared/errors/app-error"

/** A failed model call. `retryable` marks faults worth one more attempt: timeouts, 5xx, garbled replies. */
export class LlmError extends AppError {
  readonly retryable: boolean

  constructor(message: string, options: { retryable: boolean; status?: number }) {
    super(message, options.status ?? 502, "LLM is unavailable", "llm_unavailable")
    this.name = "LlmError"
    this.retryable = options.retryable
  }
}
