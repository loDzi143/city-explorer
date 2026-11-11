import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react"

import { Compass, Send, Settings } from "@/components/icons"
import type { Dict } from "@/lib/i18n"
import type { Trip } from "@/types/chat"
import type { Lang } from "@/types/lang"
import { rangeLabel } from "@/utils/dates"
import { tripPlace } from "@/utils/place"

import { useChatReply } from "../hooks/use-chat-reply"
import { assistantMessage } from "../utils/assistant-message"
import { AssistantReply } from "./assistant-reply"
import { SettingsNotice } from "./settings-notice"
import { TripPlan } from "./trip-plan"

export type TripTab = "chat" | "plan"

function AiMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
        <Compass size={15} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5 text-[14.5px] leading-[1.65]">{children}</div>
    </div>
  )
}

export function ChatView({
  trip,
  t,
  lang,
  tab,
  onTab,
  planIndex,
  onPlanIndex,
  onPlace,
  onSend,
  onEdit,
  itineraryPending,
  itineraryFailed,
  onBeginItinerary,
  onItinerary,
  onItineraryError,
}: {
  trip: Trip
  t: Dict
  lang: Lang
  tab: TripTab
  onTab: (tab: TripTab) => void
  /** Plan version shown in the plan tab; `null` is the current plan. */
  planIndex: number | null
  onPlanIndex: (index: number | null) => void
  onPlace: (date: string, placeId: string) => void
  onSend: (text: string) => void
  onEdit: () => void
  itineraryPending: boolean
  itineraryFailed: boolean
  onBeginItinerary: () => number | null
  onItinerary: (text: string, token: number) => void
  onItineraryError: (token?: number) => void
}) {
  const [draft, setDraft] = useState("")
  const scroller = useRef<HTMLDivElement>(null)
  const city = tripPlace(trip)
  const messages = trip.messages ?? []
  const lastRole = messages[messages.length - 1]?.role
  const expectingReply = messages.length === 0 || lastRole === "user" || lastRole === "system"
  const typing = !itineraryFailed && (itineraryPending || expectingReply)
  const { retry } = useChatReply({
    trip,
    lang,
    enabled: Boolean(city),
    onBegin: onBeginItinerary,
    onFinish: onItinerary,
    onError: onItineraryError,
  })

  // Opening the chat (tab switch or another trip) jumps to the bottom before paint;
  // new messages while the chat is open scroll smoothly.
  const shownTripId = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (tab !== "chat") {
      shownTripId.current = null
      return
    }
    const opened = shownTripId.current !== trip.id
    shownTripId.current = trip.id
    const box = scroller.current
    box?.scrollTo({ top: box.scrollHeight, behavior: opened ? "instant" : "smooth" })
  }, [messages.length, trip.id, itineraryPending, itineraryFailed, tab])

  if (!city) return null

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setDraft("")
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    send(draft)
  }

  const tabs: [TripTab, string][] = [
    ["chat", t.chatTab],
    ["plan", t.itinerary],
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-[680px] shrink-0 px-4 pt-3 md:px-6">
        <div role="tablist" aria-label={t.summaryTitle} className="flex rounded-xl bg-sunk p-1">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`trip-tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`trip-panel-${value}`}
              onClick={() => onTab(value)}
              className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition ${tab === value ? "bg-panel text-ink shadow-sm ring-1 ring-line" : "text-mute hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "plan" ? (
        <div role="tabpanel" id="trip-panel-plan" aria-labelledby="trip-tab-plan" className="min-h-0 flex-1">
          <TripPlan plans={trip.plans} index={planIndex} onIndex={onPlanIndex} pending={typing} onPlace={onPlace} lang={lang} t={t} />
        </div>
      ) : (
      <div role="tabpanel" id="trip-panel-chat" aria-labelledby="trip-tab-chat" className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="mx-auto w-full max-w-[680px] flex-1 space-y-6 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
        <div className="rounded-xl border border-line bg-sunk p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <span className="text-lg">{city.flag}</span>
              {t.summaryTitle}
            </div>
            <button type="button" onClick={onEdit} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-mute transition hover:bg-hover hover:text-ink">
              <Settings />
              {t.editTrip}
            </button>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="text-mute">{t.dest}</dt>
            <dd>
              {city.city}, {city.country}
            </dd>
            <dt className="text-mute">{t.dates}</dt>
            <dd>{trip.details.start && trip.details.end ? rangeLabel(trip.details.start, trip.details.end, t) : t.notSet}</dd>
            <dt className="text-mute">{t.summaryHotel}</dt>
            <dd>{trip.details.hotel || <span className="text-mute">{t.notSet}</span>}</dd>
            <dt className="text-mute">{t.summaryPrefs}</dt>
            <dd>{trip.details.prefs || <span className="text-mute">{t.notSet}</span>}</dd>
          </dl>
        </div>
        <AiMessage>{t.welcome}</AiMessage>
        {messages.map((message) =>
          message.role === "system" ? (
            <SettingsNotice key={message.id} message={message} t={t} />
          ) : message.role === "user" ? (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-hover px-4 py-2.5 text-[14.5px] leading-relaxed">{message.text}</div>
            </div>
          ) : (
            <AiMessage key={message.id}>
              <AssistantReply text={assistantMessage(message.text)} />
            </AiMessage>
          ),
        )}
        {itineraryFailed && !itineraryPending && (
          <AiMessage>
            {t.itineraryError}{" "}
            <button type="button" onClick={retry} className="text-brand underline-offset-2 hover:underline">
              {t.retry}
            </button>
          </AiMessage>
        )}
        {typing && (
          <AiMessage>
            <span className="flex items-center gap-1 py-1.5" aria-label={t.thinking}>
              {[0, 1, 2].map((index) => (
                <span key={index} className="size-1.5 animate-bounce rounded-full bg-mute" style={{ animationDelay: `${index * 120}ms` }} />
              ))}
            </span>
          </AiMessage>
        )}
      </div>
      <div className="mx-auto w-full max-w-[680px] px-4 pb-5 md:px-6">
        {!typing && trip.hints.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-2">
            {trip.hints.map((hint, index) => (
              <button key={`${index}-${hint}`} type="button" onClick={() => send(hint)} className="rounded-full border border-line px-3 py-1 text-xs text-mute transition hover:border-brand hover:text-brand">
                {hint}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl border border-line bg-sunk p-2 pl-4 transition focus-within:border-brand/60 focus-within:ring-2 focus-within:ring-brand/20">
          <textarea
            rows={1}
            value={draft}
            disabled={typing}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t.placeholder}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                send(draft)
              }
            }}
            className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm leading-5 outline-none placeholder:text-mute"
          />
          <button type="submit" disabled={typing || !draft.trim()} aria-label={t.send} className="grid size-9 place-items-center rounded-xl bg-brand text-brand-ink transition hover:brightness-110 disabled:opacity-35">
            <Send />
          </button>
        </form>
      </div>
      </div>
      )}
    </div>
  )
}
