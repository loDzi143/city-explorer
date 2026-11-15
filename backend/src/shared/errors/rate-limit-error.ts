import { AppError } from "@/shared/errors/app-error"

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number

  constructor(message: string, retryAfterSeconds: number) {
    super(message, 429, "Too many attempts. Try again later.", "rate_limited")
    this.name = "RateLimitError"
    this.retryAfterSeconds = retryAfterSeconds
  }
}
