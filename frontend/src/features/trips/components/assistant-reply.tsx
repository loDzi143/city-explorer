import { Chev } from "@/components/icons"

import { splitItinerary } from "../utils/itinerary-message"
import { MarkdownMessage } from "./markdown-message"

export function AssistantReply({ text }: { text: string }) {
  const { body, plan } = splitItinerary(text)
  return (
    <div className="space-y-3">
      {body ? <MarkdownMessage text={body} /> : null}
      {plan ? (
        <details className="group rounded-xl border border-line bg-sunk">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 text-[15px] font-semibold tracking-[-0.02em] transition hover:bg-hover marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="grid size-4 shrink-0 place-items-center text-mute transition-transform group-open:rotate-90">
              <Chev d="r" />
            </span>
            {plan.title}
          </summary>
          <div className="px-3 pt-1 pb-3">
            <MarkdownMessage text={plan.text} />
          </div>
        </details>
      ) : null}
    </div>
  )
}
