import { badRequest, clientIp, preflight, publicRoute, readJson } from "@/app/api/_lib/handler"
import { parseLoginBody } from "@/modules/account/account.schemas"
import { accountService } from "@/modules/account/account.service"
import { sessionCookie } from "@/shared/http/session-cookie"

const METHODS = "POST, OPTIONS"

export const OPTIONS = preflight(METHODS)

// Login is CSRF-checked too: otherwise a third-party page could sign the browser into an attacker's account.
export const POST = publicRoute(
  METHODS,
  { status: 500, message: "Sign-in failed", code: "login_failed" },
  async ({ request, headers }) => {
    const body = await readJson(request, headers)
    if (!body.ok) return body.response
    const parsed = parseLoginBody(body.data)
    if (!parsed.ok) return badRequest(parsed.error, headers)

    const { token, ...account } = await accountService.login(parsed.data, { ip: clientIp(request) })
    headers.append("Set-Cookie", sessionCookie(token))
    return Response.json(account, { headers })
  },
  { csrf: true },
)
