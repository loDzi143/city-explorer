import { authRoute, badRequest, notFound, preflight, readJson } from "@/app/api/_lib/handler"
import { isUuid, parseUpdateTripBody } from "@/modules/trips/trips.schemas"
import { tripsService } from "@/modules/trips/trips.service"

const METHODS = "GET, PATCH, DELETE, OPTIONS"

export const OPTIONS = preflight(METHODS)

type Params = { id: string }

export const GET = authRoute<Params>(METHODS, { status: 500, message: "Couldn't load the trip" }, async ({ params, session, headers }) => {
  if (!isUuid(params.id)) return notFound("Trip not found", "trip_not_found", headers)
  return Response.json(await tripsService.get(session.user.id, params.id), { headers })
})

/** Rename, set the destination once, or change dates, accommodation and preferences. */
export const PATCH = authRoute<Params>(METHODS, { status: 500, message: "Couldn't save the trip" }, async ({ request, params, session, headers }) => {
  if (!isUuid(params.id)) return notFound("Trip not found", "trip_not_found", headers)
  const body = await readJson(request, headers)
  if (!body.ok) return body.response
  const parsed = parseUpdateTripBody(body.data)
  if (!parsed.ok) return badRequest(parsed.error, headers)
  return Response.json(await tripsService.update(session.user.id, params.id, parsed.data), { headers })
})

export const DELETE = authRoute<Params>(METHODS, { status: 500, message: "Couldn't delete the trip" }, async ({ params, session, headers }) => {
  if (!isUuid(params.id)) return notFound("Trip not found", "trip_not_found", headers)
  await tripsService.remove(session.user.id, params.id)
  return new Response(null, { status: 204, headers })
})
