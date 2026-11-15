import { preflight, publicRoute } from "@/app/api/_lib/handler"
import { accountService } from "@/modules/account/account.service"
import { expiredSessionCookie, readSessionToken } from "@/shared/http/session-cookie"

const METHODS = "POST, OPTIONS"

export const OPTIONS = preflight(METHODS)

/** Deletes the current session and clears the cookie. Succeeds even when the session is already gone. */
export const POST = publicRoute(
  METHODS,
  { status: 500, message: "Sign-out failed", code: "logout_failed" },
  async ({ request, headers }) => {
    await accountService.logout(readSessionToken(request))
    headers.append("Set-Cookie", expiredSessionCookie())
    return new Response(null, { status: 204, headers })
  },
  { csrf: true },
)
