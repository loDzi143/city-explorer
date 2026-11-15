import { AppError } from "@/shared/errors/app-error"
import { RateLimitError } from "@/shared/errors/rate-limit-error"
import { isUnavailableError } from "@/shared/errors/unavailable"

type FallbackError = {
  status: number
  message: string
  code?: string
}

/** Every API error has the same body: `{ "error": "<public message>", "code": "<machine code>" }`. */
export function errorBody(message: string, code: string) {
  return { error: message, code }
}

export function jsonError(status: number, message: string, code: string, headers: HeadersInit) {
  return Response.json(errorBody(message, code), { status, headers })
}

export function errorResponse(error: unknown, headers: HeadersInit, fallback: FallbackError) {
  if (error instanceof RateLimitError) {
    const withRetry = new Headers(headers)
    withRetry.set("Retry-After", String(error.retryAfterSeconds))
    return jsonError(error.status, error.publicMessage, error.code, withRetry)
  }

  if (error instanceof AppError) {
    return jsonError(error.status, error.publicMessage, error.code, headers)
  }

  if (isUnavailableError(error)) {
    return jsonError(503, "Service is temporarily unavailable", "service_unavailable", headers)
  }

  return jsonError(fallback.status, fallback.message, fallback.code ?? "internal_error", headers)
}
