import { readEnv } from "@/config/env"

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
const DEFAULT_ORIGIN = "http://localhost:5173"

/** Origins allowed to call the API from a browser with credentials. Never "*": cookies are involved. */
export function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false
  const env = readEnv()
  if (env.CORS_ORIGINS.includes(origin)) return true
  return env.NODE_ENV !== "production" && LOCAL_ORIGIN.test(origin)
}

export function corsHeaders(request: Request, methods: string): HeadersInit {
  const origin = request.headers.get("origin")
  const allow = isAllowedOrigin(origin) ? origin : (readEnv().CORS_ORIGINS[0] ?? DEFAULT_ORIGIN)

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  }
}
