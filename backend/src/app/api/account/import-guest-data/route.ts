import { authRoute, badRequest, preflight, readJson } from "@/app/api/_lib/handler"
import { enforceRateLimit } from "@/app/api/_lib/rate-limit"
import { parseImportBody } from "@/modules/trips/trips.schemas"
import { tripsService } from "@/modules/trips/trips.service"

const METHODS = "POST, OPTIONS"
const MAX_IMPORT_BYTES = 10_000_000

export const OPTIONS = preflight(METHODS)

/** Moves trips kept in the browser into the account. Safe to repeat: already imported trips are skipped. */
export const POST = authRoute(
  METHODS,
  { status: 500, message: "Couldn't import guest data", code: "import_failed" },
  async ({ request, session, headers }) => {
    enforceRateLimit("importGuestData", session.user.id)
    const body = await readJson(request, headers, MAX_IMPORT_BYTES)
    if (!body.ok) return body.response
    const parsed = parseImportBody(body.data)
    if (!parsed.ok) return badRequest(parsed.error, headers)
    return Response.json(await tripsService.importGuestTrips(session.user.id, parsed.data), { headers })
  },
)
