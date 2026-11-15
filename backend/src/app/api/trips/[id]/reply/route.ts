import { authRoute, notFound, preflight } from "@/app/api/_lib/handler"
import { enforceRateLimit } from "@/app/api/_lib/rate-limit"
import { isUuid } from "@/modules/trips/trips.schemas"
import { tripsService } from "@/modules/trips/trips.service"

const METHODS = "POST, OPTIONS"

export const OPTIONS = preflight(METHODS)

type Params = { id: string }

/** Generates the pending assistant reply: the first itinerary, or the answer to a settings change. */
export const POST = authRoute<Params>(
  METHODS,
  { status: 502, message: "LLM is unavailable", code: "llm_unavailable" },
  async ({ params, session, headers }) => {
    if (!isUuid(params.id)) return notFound("Trip not found", "trip_not_found", headers)
    enforceRateLimit("tripReply", session.user.id)
    return Response.json(await tripsService.reply(session.user.id, params.id), { headers })
  },
)
