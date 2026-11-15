import { badRequest, clientIp, preflight, publicRoute } from "@/app/api/_lib/handler"
import { enforceRateLimit } from "@/app/api/_lib/rate-limit"
import { parseSuggestLocationsQuery } from "@/modules/geocoding/geocoding.schemas"
import { geocodingService } from "@/modules/geocoding/geocoding.service"

const METHODS = "GET, OPTIONS"

export const OPTIONS = preflight(METHODS)

/** City autocomplete for the trip form. An empty query is an empty list, not an error. */
export const GET = publicRoute(
  METHODS,
  { status: 502, message: "Geocoding is unavailable", code: "geocoding_unavailable" },
  async ({ request, headers }) => {
    const parsed = parseSuggestLocationsQuery(new URL(request.url).searchParams)
    if (!parsed.ok) return badRequest(parsed.error, headers)
    if (!parsed.data.query) return Response.json([], { headers })

    enforceRateLimit("suggestLocations", clientIp(request))
    return Response.json(await geocodingService.suggestLocations(parsed.data), { headers })
  },
)
