import { useCallback, useEffect } from "react"

import type { Trip } from "@/types/chat"
import { needsReply } from "@/utils/trip-messages"

/** Asks for the assistant reply whenever the trip has something unanswered; `retry` asks again after a failure. */
export function useChatReply({ trip, enabled, onRequest }: { trip: Trip; enabled: boolean; onRequest: () => void }) {
  const send = useCallback(() => {
    if (enabled && trip.messages && needsReply(trip.messages)) onRequest()
  }, [trip, enabled, onRequest])

  useEffect(() => {
    send()
  }, [send])

  return { retry: send }
}
