import { withoutItinerary } from "../utils/itinerary-message"
import { MarkdownMessage } from "./markdown-message"

export function AssistantReply({ text }: { text: string }) {
  const body = withoutItinerary(text)
  return body ? <MarkdownMessage text={body} /> : null
}
