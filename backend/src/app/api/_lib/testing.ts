// Test-only: calls route handlers like a browser on the frontend origin would, keeping the session cookie.
import { randomUUID } from "node:crypto"

export const FRONTEND_ORIGIN = "http://localhost:5173"

// Promise<never> accepts every route's params type; the test supplies matching params.
type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response>

type CallOptions = {
  method?: string
  path?: string
  body?: unknown
  params?: Record<string, string>
  headers?: Record<string, string>
  /** null sends no Origin header. */
  origin?: string | null
}

export type ApiResult<T = unknown> = {
  status: number
  body: T
  headers: Headers
  setCookies: string[]
}

export function createBrowser() {
  // A distinct client address per browser keeps rate limits of different tests apart.
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
  const jar = new Map<string, string>()

  return {
    ip,
    cookie(name: string) {
      return jar.get(name) ?? null
    },
    setCookie(name: string, value: string) {
      jar.set(name, value)
    },
    clearCookies() {
      jar.clear()
    },
    async call<T = unknown>(handler: Handler, options: CallOptions = {}): Promise<ApiResult<T>> {
      const method = options.method ?? (options.body === undefined ? "GET" : "POST")
      const headers = new Headers(options.headers)
      if (options.origin !== null) headers.set("origin", options.origin ?? FRONTEND_ORIGIN)
      headers.set("x-forwarded-for", ip)
      if (jar.size > 0) headers.set("cookie", [...jar].map(([name, value]) => `${name}=${value}`).join("; "))
      if (options.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")

      const request = new Request(`http://localhost:3000${options.path ?? "/api/test"}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : typeof options.body === "string" ? options.body : JSON.stringify(options.body),
      })
      const response = await handler(request, { params: Promise.resolve((options.params ?? {}) as never) })

      const setCookies = response.headers.getSetCookie()
      for (const cookie of setCookies) {
        const [pair, ...attributes] = cookie.split(";")
        const index = pair.indexOf("=")
        const name = pair.slice(0, index).trim()
        const value = pair.slice(index + 1).trim()
        const expired = attributes.some((attribute) => attribute.trim().toLowerCase() === "max-age=0")
        if (expired || !value) jar.delete(name)
        else jar.set(name, value)
      }

      const text = await response.text()
      return { status: response.status, body: (text ? JSON.parse(text) : null) as T, headers: response.headers, setCookies }
    },
  }
}

export function uuid() {
  return randomUUID()
}
