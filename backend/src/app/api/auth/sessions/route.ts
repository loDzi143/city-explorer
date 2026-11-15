import { authRoute, preflight } from "@/app/api/_lib/handler"
import { accountService } from "@/modules/account/account.service"
import { expiredSessionCookie } from "@/shared/http/session-cookie"

const METHODS = "DELETE, OPTIONS"

export const OPTIONS = preflight(METHODS)

/** Signs the user out everywhere: every session, the current one included, is revoked. */
export const DELETE = authRoute(METHODS, { status: 500, message: "Couldn't end the sessions" }, async ({ session, headers }) => {
  await accountService.revokeAllSessions(session.user.id)
  headers.delete("Set-Cookie")
  headers.append("Set-Cookie", expiredSessionCookie())
  return new Response(null, { status: 204, headers })
})
