import { AppError } from "@/shared/errors/app-error"
import { tripAgent, type createTripAgent } from "@/modules/ai/agents/trip.agent"
import { applyTripReply, buildTripMessages } from "@/modules/ai/agents/trip-conversation"
import type { TripChatInput, TripChatResult } from "@/modules/ai/agents/agent.types"

type TripAgent = Pick<ReturnType<typeof createTripAgent>, "reply">

/**
 * Trip conversation used by both modes: the guest route passes the state from the browser,
 * the trips module passes the state loaded from PostgreSQL. Prompt and context are built here.
 */
export function createTripChatService(agent: TripAgent = tripAgent) {
  return {
    async reply(input: TripChatInput): Promise<TripChatResult> {
      if (!input.state.initial && input.turns.length === 0) {
        throw new AppError("Nothing to reply to", 400, "There is no new message to reply to", "nothing_to_reply")
      }
      const reply = await agent.reply({
        messages: buildTripMessages(input),
        destination: input.state.destination,
        knownPlaces: input.state.plan?.days.flatMap((day) => day.places) ?? [],
      })
      return applyTripReply(input.state, reply)
    },
  }
}

export type TripChatService = ReturnType<typeof createTripChatService>

export const tripChatService = createTripChatService()
