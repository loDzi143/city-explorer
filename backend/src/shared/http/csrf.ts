import { isAllowedOrigin } from "@/shared/http/cors"
import { jsonError } from "@/shared/http/error-response"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * CSRF guard for cookie-authenticated routes.
 *
 * The session cookie is SameSite=Lax, so a cross-site page can't send it with fetch/XHR, but Lax still
 * allows top-level form POSTs from sibling subdomains. Every state-changing request must therefore come
 * from an allowed Origin (browsers always send Origin on cross-origin and on same-origin POST/PATCH/DELETE)
 * and carry a JSON body, which a plain HTML form can't produce without a CORS preflight.
 *
 * Returns a 403 response to send back, or null when the request may proceed.
 */
export function csrfRejection(request: Request, headers: HeadersInit): Response | null {
  if (SAFE_METHODS.has(request.method)) return null

  const origin = request.headers.get("origin")
  const sameOrigin = origin !== null && origin === new URL(request.url).origin
  if (!sameOrigin && !isAllowedOrigin(origin)) {
    return jsonError(403, "Request origin is not allowed", "forbidden_origin", headers)
  }

  // HTML forms and no-cors fetches always send a urlencoded, multipart or text/plain Content-Type.
  const contentType = request.headers.get("content-type")
  if (contentType !== null && !/^application\/json\b/i.test(contentType)) {
    return jsonError(415, "Content-Type must be application/json", "unsupported_media_type", headers)
  }

  return null
}
