const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
const DEFAULT_ORIGIN = "http://localhost:5173"

export function corsHeaders(request: Request, methods: string): HeadersInit {
  const origin = request.headers.get("origin")
  const allow = origin && LOCAL_ORIGIN.test(origin) ? origin : DEFAULT_ORIGIN

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  }
}
