import { AppError } from "@/shared/errors/app-error"
import { parseAgentResponse } from "@/modules/ai/agents/agent.schemas"
import type { AgentResponse, TripAgentInput, TripDestination } from "@/modules/ai/agents/agent.types"
import type { ChatMessage, ModelMessage, ToolCall } from "@/modules/ai/llm/chat.types"
import { chatService, createChatService } from "@/modules/ai/llm/chat.service"
import { executeGeocodePlaces, geocodePlacesTool } from "@/modules/ai/tools/geocode-places.tool"

const TOOL_ROUNDS = 3

const JSON_REPAIR =
  "The previous reply was not valid JSON. Reply again with only one JSON object { \"message\": string, \"days\": [{ \"date\": \"YYYY-MM-DD\", \"places\": [{ \"id\": string, \"name\": string, \"description\": string, \"coordinates\": { \"latitude\": number, \"longitude\": number } }] }], \"hints\": [string, string, string] }. Do not call tools."

export function createTripAgent(service: Pick<ReturnType<typeof createChatService>, "complete"> = chatService) {
  return {
    async reply(input: TripAgentInput): Promise<AgentResponse> {
      const messages: ModelMessage[] = input.messages.map(toModelMessage)
      let toolRounds = 0
      let repaired = false

      for (;;) {
        const tools = !repaired && toolRounds < TOOL_ROUNDS ? [geocodePlacesTool] : undefined
        const completion = await service.complete(messages, tools)
        if (tools && completion.toolCalls.length > 0) {
          toolRounds += 1
          messages.push({
            role: "assistant",
            content: completion.content,
            toolCalls: completion.toolCalls,
          })
          for (const call of completion.toolCalls) {
            messages.push(await toolResultMessage(call, input.destination))
          }
          continue
        }

        const parsed = parseAgentResponse(completion.content ?? "")
        if (parsed) return parsed
        if (repaired || !completion.content) break
        repaired = true
        messages.push({ role: "assistant", content: completion.content })
        messages.push({ role: "user", content: JSON_REPAIR })
      }

      throw new AppError("OpenRouter response is invalid", 502, "LLM is unavailable")
    },
  }
}

function toModelMessage(message: ChatMessage): ModelMessage {
  if (message.role === "system") return { role: "system", content: message.content }
  if (message.role === "user") return { role: "user", content: message.content }
  return { role: "assistant", content: message.content }
}

async function toolResultMessage(call: ToolCall, destination: TripDestination): Promise<ModelMessage> {
  const result = call.name === geocodePlacesTool.name
    ? await executeGeocodePlaces(call.arguments, destination)
    : { error: "Unknown tool" }

  return {
    role: "tool",
    toolCallId: call.id,
    name: call.name,
    content: JSON.stringify(result),
  }
}

export const tripAgent = createTripAgent()
