export class AppError extends Error {
  readonly status: number
  readonly publicMessage: string
  /** Stable machine-readable error code for clients. */
  readonly code: string

  constructor(message: string, status: number, publicMessage?: string, code?: string) {
    super(message)
    this.name = "AppError"
    this.status = status
    this.publicMessage = publicMessage ?? message
    this.code = code ?? defaultCode(status)
  }
}

function defaultCode(status: number) {
  if (status === 400) return "bad_request"
  if (status === 401) return "unauthorized"
  if (status === 403) return "forbidden"
  if (status === 404) return "not_found"
  if (status === 409) return "conflict"
  if (status === 429) return "rate_limited"
  if (status === 503) return "service_unavailable"
  return "upstream_error"
}
