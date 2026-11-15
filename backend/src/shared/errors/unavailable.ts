// Network failures and PostgreSQL SQLSTATE codes that mean "the dependency is down", not "the request is wrong".
const UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "57P01",
  "57P02",
  "57P03",
  "53300",
])

/** True when the error (or one of its causes) is a connection failure to a backing service. */
export function isUnavailableError(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== "object") return false
    const code = (current as { code?: unknown }).code
    if (typeof code === "string" && (UNAVAILABLE_CODES.has(code) || code.startsWith("08"))) return true
    const message = (current as { message?: unknown }).message
    if (typeof message === "string" && /connection terminated|timeout exceeded when trying to connect/i.test(message)) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
