import { authRoute, badRequest, preflight, readJson } from "@/app/api/_lib/handler"
import { parseCreateTripBody } from "@/modules/trips/trips.schemas"
import { tripsService } from "@/modules/trips/trips.service"

const METHODS = "GET, POST, OPTIONS"

export const OPTIONS = preflight(METHODS)

/** The user's trips, newest first, with their messages and plan versions. */
export const GET = authRoute(METHODS, { status: 500, message: "Couldn't load trips", code: "trips_unavailable" }, async ({ session, headers }) => {
  return Response.json(await tripsService.list(session.user.id), { headers })
})

export const POST = authRoute(METHODS, { status: 500, message: "Couldn't create the trip" }, async ({ request, session, headers }) => {
  const body = await readJson(request, headers)
  if (!body.ok) return body.response
  const parsed = parseCreateTripBody(body.data)
  if (!parsed.ok) return badRequest(parsed.error, headers)

  const { trip, created } = await tripsService.create(session.user.id, parsed.data)
  return Response.json(trip, { status: created ? 201 : 200, headers })
})
