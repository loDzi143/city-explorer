import { badRequest, clientIp, preflight, publicRoute, readJson } from "@/app/api/_lib/handler"
import { enforceRateLimit } from "@/app/api/_lib/rate-limit"
import { parseGuestChatBody } from "@/modules/ai/ai.schemas"
import { tripChatService } from "@/modules/ai/ai.service"

const METHODS = "POST, OPTIONS"
/** A guest request carries one plan and the unanswered messages; anything bigger is not a real trip. */
const MAX_CHAT_BYTES = 300_000

export const OPTIONS = preflight(METHODS)

/**
 * Guest chat: the browser keeps the trip in localStorage and sends its current state plus the
 * unanswered messages. The server builds the prompt, calls the model and returns the reply applied
 * to that state; nothing is stored. Signed-in users use POST /api/trips/:id/messages instead.
 *
 * There is no account to bill, so the route accepts only the frontend's origin and is rate limited.
 */
export const POST = publicRoute(
  METHODS,
  { status: 502, message: "LLM is unavailable", code: "llm_unavailable" },
  async ({ request, headers }) => {
    const body = await readJson(request, headers, MAX_CHAT_BYTES)
    if (!body.ok) return body.response
    const parsed = parseGuestChatBody(body.data)
    if (!parsed.ok) return badRequest(parsed.error, headers)

    enforceRateLimit("guestChat", clientIp(request))
    enforceRateLimit("guestChatTotal", "all")
    const result = await tripChatService.reply(parsed.data)
    return Response.json(result, { headers })
  },
  { csrf: true },
)
