import { authRoute, badRequest, preflight, readJson } from "@/app/api/_lib/handler"
import { parseSettingsPatch } from "@/modules/account/account.schemas"
import { accountService } from "@/modules/account/account.service"

const METHODS = "GET, PATCH, OPTIONS"

export const OPTIONS = preflight(METHODS)

export const GET = authRoute(METHODS, { status: 500, message: "Couldn't load settings" }, async ({ session, headers }) => {
  return Response.json(await accountService.getSettings(session.user.id), { headers })
})

export const PATCH = authRoute(METHODS, { status: 500, message: "Couldn't save settings" }, async ({ request, session, headers }) => {
  const body = await readJson(request, headers)
  if (!body.ok) return body.response
  const parsed = parseSettingsPatch(body.data)
  if (!parsed.ok) return badRequest(parsed.error, headers)
  return Response.json(await accountService.updateSettings(session.user.id, parsed.data), { headers })
})
