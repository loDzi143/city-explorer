import axios from "axios"

import { config } from "@/config"

/** Ordinary requests answer in well under a second; past this the connection is treated as lost. */
const REQUEST_TIMEOUT_MS = 30_000
/** A model reply may take minutes; the server gives up after five, so this only catches a dead connection. */
export const REPLY_TIMEOUT_MS = 6 * 60_000
/** Importing guest data uploads every trip in one request. */
export const IMPORT_TIMEOUT_MS = 2 * 60_000

export const api = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: REQUEST_TIMEOUT_MS,
  // The session lives in an HttpOnly cookie set by the API; the browser must send it cross-origin.
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
})

/** A failed API call, reduced to what the app decides on. */
export type ApiFailure =
  | { kind: "network" }
  | { kind: "http"; status: number; code: string | null; message: string | null }

export function apiFailure(error: unknown): ApiFailure {
  if (axios.isAxiosError(error) && error.response) {
    const body = error.response.data as { error?: unknown; code?: unknown } | undefined
    return {
      kind: "http",
      status: error.response.status,
      code: typeof body?.code === "string" ? body.code : null,
      message: typeof body?.error === "string" ? body.error : null,
    }
  }
  return { kind: "network" }
}

/** The session is missing or expired. */
export function isUnauthorized(error: unknown) {
  const failure = apiFailure(error)
  return failure.kind === "http" && failure.status === 401
}

export function failureCode(error: unknown): string | null {
  const failure = apiFailure(error)
  return failure.kind === "http" ? failure.code : null
}
