import { badRequest, clientIp, preflight, publicRoute, readJson } from "@/app/api/_lib/handler"
import { parseRegisterBody } from "@/modules/account/account.schemas"
import { accountService } from "@/modules/account/account.service"
import { sessionCookie } from "@/shared/http/session-cookie"

const METHODS = "POST, OPTIONS"

export const OPTIONS = preflight(METHODS)

export const POST = publicRoute(
  METHODS,
  { status: 500, message: "Registration failed", code: "registration_failed" },
  async ({ request, headers }) => {
    const body = await readJson(request, headers)
    if (!body.ok) return body.response
    const parsed = parseRegisterBody(body.data)
    if (!parsed.ok) return badRequest(parsed.error, headers)

    const { token, ...account } = await accountService.register(parsed.data, { ip: clientIp(request) })
    headers.append("Set-Cookie", sessionCookie(token))
    return Response.json(account, { status: 201, headers })
  },
  { csrf: true },
)
