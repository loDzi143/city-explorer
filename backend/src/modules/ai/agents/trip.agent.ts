import { logger } from "@/infrastructure/logging/logger"
import { parseAgentResponse } from "@/modules/ai/agents/agent.schemas"
import type { AgentResponse, TripAgentInput, TripDestination } from "@/modules/ai/agents/agent.types"
import { verifyItineraryPlaces } from "@/modules/ai/agents/place-check"
import type { ModelMessage, ToolCall } from "@/modules/ai/llm/chat.types"
import { chatService, createChatService, hasRawToolMarkup } from "@/modules/ai/llm/chat.service"
import { LlmError } from "@/modules/ai/llm/llm-error"
import { executeGeocodePlaces, geocodePlacesTool, type GeocodedPlace } from "@/modules/ai/tools/geocode-places.tool"
import type { Coordinates } from "@/shared/lib/geo"

/** Geocoding rounds the model may use; long trips and retries of ambiguous places need several. */
const TOOL_ROUNDS = 5
/** Requests after the last allowed tool round: asking the model to finish, and one JSON repair. */
const FINISH_REQUESTS = 4
/**
 * Time for the whole reply, all requests and retries included. One request may take two minutes;
 * without a total, a slow upstream could hold an HTTP request (and the user) for most of an hour.
 */
const REPLY_BUDGET_MS = 5 * 60_000

const FINISH_NOW =
  "Geocoding limit reached. Do not call any tools again. Return the final JSON answer now, using only places resolved by earlier geocode_places results and leaving out unresolved ones."

const TOOL_LIMIT_REACHED = JSON.stringify({ error: FINISH_NOW })

const JSON_REPAIR =
  "The previous reply was not valid JSON. Reply again with only one JSON object { \"message\": string, \"days\": [{ \"date\": \"YYYY-MM-DD\", \"places\": [{ \"id\": string, \"name\": string, \"description\": string, \"coordinates\": { \"latitude\": number, \"longitude\": number } }] }], \"hints\": [string, string, string], \"conversationContext\": { \"activeTopic\": string | null, \"pendingQuestion\": string | null, \"discussedOptions\": [string], \"unresolvedReferences\": [string] }, \"settings\"?: { \"start\"?: \"YYYY-MM-DD\", \"end\"?: \"YYYY-MM-DD\", \"hotel\"?: string, \"prefs\"?: string } }. Include settings only if the user changed trip settings. Do not call tools."

type ChatService = Pick<ReturnType<typeof createChatService>, "complete">

/**
 * Runs the conversation with the geocoding tool until the model returns the reply JSON.
 *
 * The tool stays declared in every request: once the history contains tool calls, some upstream
 * providers garble the answer when the tool definition disappears. After TOOL_ROUNDS the model is
 * told to finish and offered no tool (tool_choice "none"); a further call, structured or written
 * as text, gets the same instruction instead of failing the whole reply.
 *
 * Places in the final reply are checked against the saved plan and the geocoding results of this
 * run, so coordinates the model retyped or made up never reach the trip.
 */
export function createTripAgent(service: ChatService = chatService, options: { replyBudgetMs?: number } = {}) {
  const replyBudgetMs = options.replyBudgetMs ?? REPLY_BUDGET_MS

  return {
    async reply(input: TripAgentInput): Promise<AgentResponse> {
      const messages: ModelMessage[] = [...input.messages]
      const tools = [geocodePlacesTool]
      const deadline = Date.now() + replyBudgetMs
      const known = new Map<string, Coordinates>((input.knownPlaces ?? []).map((place) => [place.id, place.coordinates]))
      let toolRounds = 0
      let repaired = false

      for (let request = 0; request < TOOL_ROUNDS + FINISH_REQUESTS; request += 1) {
        const toolsAllowed = toolRounds < TOOL_ROUNDS && !repaired
        const completion = await service.complete(messages, tools, { toolChoice: toolsAllowed ? "auto" : "none", deadline })

        if (completion.toolCalls.length > 0) {
          messages.push({ role: "assistant", content: completion.content, toolCalls: completion.toolCalls })
          for (const call of completion.toolCalls) {
            messages.push(toolsAllowed ? await toolResultMessage(call, input.destination, known) : refusedToolMessage(call))
          }
          if (toolsAllowed) {
            toolRounds += 1
            if (toolRounds === TOOL_ROUNDS) messages.push({ role: "user", content: FINISH_NOW })
          }
          continue
        }

        // Without tools offered the model may still write a call as text; tell it again to finish.
        if (!toolsAllowed && hasRawToolMarkup(completion.content)) {
          messages.push({ role: "user", content: FINISH_NOW })
          continue
        }

        const parsed = parseAgentResponse(completion.content ?? "")
        if (parsed) return withVerifiedPlaces(parsed, known, input.destination)
        if (repaired) break
        repaired = true
        if (completion.content) messages.push({ role: "assistant", content: completion.content })
        messages.push({ role: "user", content: JSON_REPAIR })
      }

      throw new LlmError("OpenRouter response is invalid: no valid reply JSON", { retryable: false })
    },
  }
}

function withVerifiedPlaces(reply: AgentResponse, known: ReadonlyMap<string, Coordinates>, destination: TripDestination): AgentResponse {
  const { days, rejected } = verifyItineraryPlaces(reply.days, known, destination)
  if (rejected.length > 0) {
    logger.warn(`Dropped ${rejected.length} itinerary place(s) with unverified coordinates far from the destination`)
  }
  return { ...reply, days }
}

/** Runs a tool call and remembers the places it resolved: their coordinates are the trusted ones. */
async function toolResultMessage(call: ToolCall, destination: TripDestination, known: Map<string, Coordinates>): Promise<ModelMessage> {
  const result = call.name === geocodePlacesTool.name ? await executeGeocodePlaces(call.arguments, destination) : { error: "Unknown tool" }
  if (Array.isArray(result)) rememberResolved(result, known)

  return {
    role: "tool",
    toolCallId: call.id,
    name: call.name,
    content: JSON.stringify(result),
  }
}

function rememberResolved(places: GeocodedPlace[], known: Map<string, Coordinates>) {
  for (const place of places) {
    if (place.status === "found") known.set(place.id, place.coordinates)
  }
}

function refusedToolMessage(call: ToolCall): ModelMessage {
  return { role: "tool", toolCallId: call.id, name: call.name, content: TOOL_LIMIT_REACHED }
}

export const tripAgent = createTripAgent()
