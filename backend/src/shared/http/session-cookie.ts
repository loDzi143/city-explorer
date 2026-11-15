import { readEnv } from "@/config/env"

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

// In production the cookie is Secure, so the stricter __Host- prefix can be used: the browser then
// refuses it unless it is Secure, has Path=/ and no Domain, which blocks subdomain cookie injection.
function cookieName() {
  return readEnv().NODE_ENV === "production" ? "__Host-ce_session" : "ce_session"
}

function attributes(maxAge: number) {
  const parts = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`]
  if (readEnv().NODE_ENV === "production") parts.push("Secure")
  return parts.join("; ")
}

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("cookie")
  if (!header) return null
  const name = cookieName()
  for (const part of header.split(";")) {
    const index = part.indexOf("=")
    if (index === -1) continue
    if (part.slice(0, index).trim() !== name) continue
    const value = part.slice(index + 1).trim()
    // Tokens are base64url; anything else is not ours.
    return /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null
  }
  return null
}

export function sessionCookie(token: string, maxAge = SESSION_TTL_SECONDS) {
  return `${cookieName()}=${token}; ${attributes(maxAge)}`
}

export function expiredSessionCookie() {
  return `${cookieName()}=; ${attributes(0)}`
}
