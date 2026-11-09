import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"

import { Compass, Send, Settings } from "@/components/icons"
import type { Dict } from "@/lib/i18n"
import type { Chat } from "@/types/chat"
import type { Lang } from "@/types/lang"
import { rangeLabel } from "@/utils/dates"
import { tripPlace } from "@/utils/place"

import { useChatReply } from "../hooks/use-chat-reply"
import { assistantMessage } from "../utils/assistant-message"
import { MarkdownMessage } from "./markdown-message"

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
  chat,
  t,
  lang,
  onSend,
  onEdit,
  itineraryPending,
  itineraryFailed,
  onBeginItinerary,
  onItinerary,
  onItineraryError,
}: {
  chat: Chat
  t: Dict
  lang: Lang
  onSend: (text: string) => void
  onEdit: () => void
  itineraryPending: boolean
  itineraryFailed: boolean
  onBeginItinerary: () => boolean
  onItinerary: (text: string) => void
  onItineraryError: () => void
}) {
  const [draft, setDraft] = useState("")
  const end = useRef<HTMLDivElement>(null)
  const city = tripPlace(chat)
  const messages = chat.messages ?? []
  const lastRole = messages[messages.length - 1]?.role
  const expectingReply = messages.length === 0 || lastRole === "user"
  const typing = !itineraryFailed && (itineraryPending || expectingReply)
  const { retry } = useChatReply({
    chat,
    lang,
    enabled: Boolean(city),
    onBegin: onBeginItinerary,
    onFinish: onItinerary,
    onError: onItineraryError,
  })

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, chat.id, itineraryPending, itineraryFailed])

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

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-[680px] flex-1 space-y-6 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
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
            <dd>{chat.start && chat.end ? rangeLabel(chat.start, chat.end, t) : t.notSet}</dd>
            <dt className="text-mute">{t.summaryHotel}</dt>
            <dd>{chat.hotel || <span className="text-mute">{t.notSet}</span>}</dd>
            <dt className="text-mute">{t.summaryPrefs}</dt>
            <dd>{chat.prefs || <span className="text-mute">{t.notSet}</span>}</dd>
          </dl>
        </div>
        <AiMessage>{t.welcome}</AiMessage>
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-hover px-4 py-2.5 text-[14.5px] leading-relaxed">{message.text[lang]}</div>
            </div>
          ) : (
            <AiMessage key={message.id}>
              <MarkdownMessage text={assistantMessage(message.text[lang])} />
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
        <div ref={end} />
      </div>
      <div className="mx-auto w-full max-w-[680px] px-4 pb-5 md:px-6">
        <div className="mb-2.5 flex flex-wrap gap-2">
          {t.chips.map((chip) => (
            <button key={chip} type="button" disabled={typing} onClick={() => send(chip)} className="rounded-full border border-line px-3 py-1 text-xs text-mute transition hover:border-brand hover:text-brand disabled:pointer-events-none disabled:opacity-35">
              {chip}
            </button>
          ))}
        </div>
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
  )
}
