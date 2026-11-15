import { authRoute, preflight } from "@/app/api/_lib/handler"
import { accountService } from "@/modules/account/account.service"

const METHODS = "GET, OPTIONS"

export const OPTIONS = preflight(METHODS)

/** The signed-in user and their settings; 401 for a guest or an expired session. */
export const GET = authRoute(METHODS, { status: 500, message: "Couldn't load the account" }, async ({ session, headers }) => {
  return Response.json(await accountService.me(session), { headers })
})
