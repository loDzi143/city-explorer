import { authRoute, badRequest, notFound, preflight, readJson } from "@/app/api/_lib/handler"
import { enforceRateLimit } from "@/app/api/_lib/rate-limit"
import { isUuid, parseSendMessagesBody } from "@/modules/trips/trips.schemas"
import { tripsService } from "@/modules/trips/trips.service"

const METHODS = "GET, POST, OPTIONS"

export const OPTIONS = preflight(METHODS)

type Params = { id: string }

/** Chat history of the trip, oldest first. */
export const GET = authRoute<Params>(METHODS, { status: 500, message: "Couldn't load messages" }, async ({ params, session, headers }) => {
  if (!isUuid(params.id)) return notFound("Trip not found", "trip_not_found", headers)
  return Response.json(await tripsService.messages(session.user.id, params.id), { headers })
})

/**
 * Stores the user's messages and returns the trip with the assistant reply. Messages carry
 * client ids: repeating the request after a network error never stores them twice.
 */
export const POST = authRoute<Params>(
  METHODS,
  { status: 502, message: "LLM is unavailable", code: "llm_unavailable" },
  async ({ request, params, session, headers }) => {
    if (!isUuid(params.id)) return notFound("Trip not found", "trip_not_found", headers)
    const body = await readJson(request, headers)
    if (!body.ok) return body.response
    const parsed = parseSendMessagesBody(body.data)
    if (!parsed.ok) return badRequest(parsed.error, headers)
    enforceRateLimit("tripReply", session.user.id)
    return Response.json(await tripsService.sendMessages(session.user.id, params.id, parsed.data), { headers })
  },
)
