// Shared plumbing for route handlers: CORS, CSRF, session lookup, JSON body parsing and error mapping.
// The `_lib` folder is private in the App Router and never becomes a URL.
import { readEnv } from "@/config/env"
import { logger } from "@/infrastructure/logging/logger"
import { accountService } from "@/modules/account/account.service"
import type { AuthenticatedSession } from "@/modules/account/account.types"
import { AppError } from "@/shared/errors/app-error"
import { corsHeaders } from "@/shared/http/cors"
import { csrfRejection } from "@/shared/http/csrf"
import { errorResponse, jsonError } from "@/shared/http/error-response"
import { expiredSessionCookie, readSessionToken, sessionCookie } from "@/shared/http/session-cookie"

type Params = Record<string, string>

type RouteContext<P extends Params> = { params: Promise<P> }

type HandlerContext<P extends Params> = {
  request: Request
  params: P
  headers: Headers
}

type Fallback = { status: number; message: string; code?: string }

const MAX_BODY_BYTES = 1_000_000

/** Expected refusals (4xx) are part of normal traffic; only faults reach the log. */
function report(error: unknown) {
  if (!(error instanceof AppError) || error.status >= 500) logger.error(error)
}

export function preflight(methods: string) {
  return (request: Request) => new Response(null, { status: 204, headers: corsHeaders(request, methods) })
}

/** A route that works without an account. Cookie-based routes (login, logout) still get the CSRF check. */
export function publicRoute<P extends Params = Params>(
  methods: string,
  fallback: Fallback,
  handler: (context: HandlerContext<P>) => Promise<Response>,
  options: { csrf?: boolean } = {},
) {
  return async (request: Request, context: RouteContext<P>) => {
    const headers = new Headers(corsHeaders(request, methods))
    if (options.csrf) {
      const rejected = csrfRejection(request, headers)
      if (rejected) return rejected
    }
    try {
      return await handler({ request, params: await context.params, headers })
    } catch (error) {
      report(error)
      return errorResponse(error, headers, fallback)
    }
  }
}

/** A route over account data: requires a live session and passes it to the handler. */
export function authRoute<P extends Params = Params>(
  methods: string,
  fallback: Fallback,
  handler: (context: HandlerContext<P> & { session: AuthenticatedSession; token: string }) => Promise<Response>,
) {
  return async (request: Request, context: RouteContext<P>) => {
    const headers = new Headers(corsHeaders(request, methods))
    const rejected = csrfRejection(request, headers)
    if (rejected) return rejected

    try {
      const token = readSessionToken(request)
      const session = await accountService.authenticate(token)
      if (!session || !token) {
        if (token) headers.append("Set-Cookie", expiredSessionCookie())
        return jsonError(401, "Authentication required", "unauthorized", headers)
      }
      if (session.renewed) headers.append("Set-Cookie", sessionCookie(token))
      return await handler({ request, params: await context.params, headers, session, token })
    } catch (error) {
      report(error)
      return errorResponse(error, headers, fallback)
    }
  }
}

export type JsonBody = { ok: true; data: unknown } | { ok: false; response: Response }

/**
 * Reads the body as text, stopping as soon as it exceeds the limit: a chunked request has no
 * Content-Length, so the size is only known while reading. Returns null when the body is too large.
 */
async function readText(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
}

/** Reads a JSON body of bounded size. An empty body is `{}`. */
export async function readJson(request: Request, headers: HeadersInit, maxBytes = MAX_BODY_BYTES): Promise<JsonBody> {
  const tooLarge = () => ({ ok: false as const, response: jsonError(413, "Request body is too large", "payload_too_large", headers) })
  if (Number(request.headers.get("content-length") ?? "0") > maxBytes) return tooLarge()

  let text: string | null
  try {
    text = await readText(request, maxBytes)
  } catch {
    return { ok: false, response: jsonError(400, "Invalid request body", "bad_request", headers) }
  }
  if (text === null) return tooLarge()
  if (!text.trim()) return { ok: true, data: {} }
  try {
    return { ok: true, data: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, response: jsonError(400, "Request body must be valid JSON", "bad_request", headers) }
  }
}

export function notFound(message: string, code: string, headers: HeadersInit) {
  return jsonError(404, message, code, headers)
}

export function badRequest(message: string, headers: HeadersInit) {
  return jsonError(400, message, "validation_error", headers)
}

/**
 * Client address for rate limiting, taken from X-Forwarded-For.
 *
 * Every proxy appends the address it received the request from, so with N trusted proxies
 * (TRUST_PROXY) the client is the Nth entry from the end; anything before it was sent by the client
 * and can be forged. Without a proxy the last entry is used: Next.js fills the header with the socket
 * address, but only when the client sent none, so a directly exposed backend can't rely on it alone.
 */
export function clientIp(request: Request) {
  const forwarded = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  const hops = Math.max(1, readEnv().TRUST_PROXY)
  return forwarded.at(-hops) ?? forwarded[0] ?? "unknown"
}
