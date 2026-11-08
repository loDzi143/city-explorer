import { logger } from "@/infrastructure/logging/logger"
import { parseSuggestLocationsQuery } from "@/modules/geocoding/geocoding.schemas"
import { geocodingService } from "@/modules/geocoding/geocoding.service"
import { corsHeaders } from "@/shared/http/cors"
import { errorResponse } from "@/shared/http/error-response"

const SUGGEST_METHODS = "GET, OPTIONS"

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request, SUGGEST_METHODS) })
}

export async function GET(request: Request) {
  const headers = corsHeaders(request, SUGGEST_METHODS)
  const parsed = parseSuggestLocationsQuery(new URL(request.url).searchParams)

  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400, headers })
  }

  if (!parsed.data.query) {
    return Response.json([], { headers })
  }

  try {
    const suggestions = await geocodingService.suggestLocations(parsed.data)
    return Response.json(suggestions, { headers })
  } catch (error) {
    logger.error(error)
    return errorResponse(error, headers, { status: 502, message: "Geocoding is unavailable" })
  }
}
