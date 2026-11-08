import { AppError } from "@/shared/errors/app-error"

type FallbackError = {
  status: number
  message: string
}

export function errorResponse(error: unknown, headers: HeadersInit, fallback: FallbackError) {
  if (error instanceof AppError) {
    return Response.json({ error: error.publicMessage }, { status: error.status, headers })
  }

  return Response.json({ error: fallback.message }, { status: fallback.status, headers })
}
