import { logger } from "@/infrastructure/logging/logger"
import { parseChatLlmBody } from "@/modules/ai/llm/chat.schemas"
import { chatService } from "@/modules/ai/llm/chat.service"
import { corsHeaders } from "@/shared/http/cors"
import { errorResponse } from "@/shared/http/error-response"

const CHAT_LLM_METHODS = "POST, OPTIONS"

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request, CHAT_LLM_METHODS) })
}

export async function POST(request: Request) {
  const headers = corsHeaders(request, CHAT_LLM_METHODS)

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: "Message is required" }, { status: 400, headers })
  }

  const parsed = parseChatLlmBody(payload)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400, headers })
  }

  try {
    const completion = await chatService.complete(parsed.data.messages)
    return Response.json(completion, { headers })
  } catch (error) {
    logger.error(error)
    return errorResponse(error, headers, { status: 502, message: "LLM is unavailable" })
  }
}
