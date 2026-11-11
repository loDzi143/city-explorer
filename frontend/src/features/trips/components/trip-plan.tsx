import { useEffect, useRef, useState } from "react"

import { Cal, Chev, Compass } from "@/components/icons"
import type { Dict } from "@/lib/i18n"
import type { TripPlan as Plan } from "@/types/chat"
import type { Lang } from "@/types/lang"
import { formatItineraryDay, formatSavedAt, rangeLabel } from "@/utils/dates"

function VersionSelect({
  plans,
  value,
  onChange,
  lang,
  t,
}: {
  plans: Plan[]
  value: number
  onChange: (index: number) => void
  lang: Lang
  t: Dict
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const latest = plans.length - 1

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={t.planVersions}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-ink transition hover:bg-hover"
      >
        <span className="text-mute">
          <Cal />
        </span>
        {formatSavedAt(plans[value].date, lang)}
        <span className={`text-mute transition ${open ? "rotate-180" : ""}`}>
          <Chev d="d" />
        </span>
      </button>
      {open && (
        <div role="listbox" aria-label={t.planVersions} className="absolute top-10 left-0 z-30 max-h-72 min-w-full overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-xl">
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-[.08em] text-mute">{t.planVersions}</div>
          {plans
            .map((plan, index) => ({ plan, index }))
            .reverse()
            .map(({ plan, index }) => {
              const selected = index === value
              return (
                <button
                  key={`${index}-${plan.date}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(index)
                    setOpen(false)
                  }}
                  className={`flex h-8 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[13px] whitespace-nowrap transition ${selected ? "bg-brand-soft font-medium text-ink" : "text-ink hover:bg-hover"}`}
                >
                  {formatSavedAt(plan.date, lang)}
                  {index === latest && <span className="text-[11px] font-medium text-brand">{t.planCurrent}</span>}
                </button>
              )
            })}
        </div>
      )}
    </div>
  )
}

export function TripPlan({
  plans,
  index,
  onIndex,
  pending,
  onPlace,
  lang,
  t,
}: {
  plans: Plan[]
  /** Plan being viewed; `null` means the current (latest) plan. */
  index: number | null
  onIndex: (index: number | null) => void
  pending: boolean
  /** Shows a place of the current plan on the map. */
  onPlace?: (date: string, placeId: string) => void
  lang: Lang
  t: Dict
}) {
  const latest = plans.length - 1
  const current = index != null && plans[index] ? index : latest
  const plan = plans[current]

  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-8">
        <div className="max-w-[320px] text-center">
          <div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
            <Compass size={20} />
          </div>
          <p className="text-[15px] font-medium">{t.planEmpty}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-mute">{pending ? t.planPending : t.planEmptyHint}</p>
        </div>
      </div>
    )
  }

  const isLatest = current === latest

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[680px] space-y-5 px-4 py-5 md:px-6 md:py-6">
        <div className="rounded-xl border border-line bg-sunk p-4">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-[-0.02em]">{t.itinerary}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isLatest ? "bg-brand-soft text-brand" : "bg-hover text-mute"}`}>
              {isLatest ? t.planCurrent : t.planPrevious}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-mute">{plan.start && plan.end ? rangeLabel(plan.start, plan.end, t) : t.notSet}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-3">
            {plans.length > 1 ? (
              <VersionSelect plans={plans} value={current} onChange={(next) => onIndex(next === latest ? null : next)} lang={lang} t={t} />
            ) : (
              <span className="text-xs text-mute">{t.planSaved(formatSavedAt(plan.date, lang))}</span>
            )}
            {!isLatest && (
              <button type="button" onClick={() => onIndex(null)} className="text-[13px] text-brand underline-offset-2 hover:underline">
                {t.planShowCurrent}
              </button>
            )}
          </div>
        </div>
        {plan.days.map((day) => (
          <section key={day.date}>
            <h4 className="mb-2.5 text-[14px] font-semibold tracking-[-0.01em]">{formatItineraryDay(day.date, lang)}</h4>
            {day.places.length > 0 ? (
              <ol className="space-y-3">
                {day.places.map((place, placeIndex) => {
                  const show = isLatest && onPlace ? () => onPlace(day.date, place.id) : null
                  const number = "mt-px grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-medium text-brand"
                  return (
                  <li key={place.id} className="group/place flex gap-3">
                    {show ? (
                      <button type="button" tabIndex={-1} aria-hidden onClick={show} className={`${number} transition group-hover/place:bg-brand group-hover/place:text-brand-ink`}>
                        {placeIndex + 1}
                      </button>
                    ) : (
                      <span className={number}>{placeIndex + 1}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      {show ? (
                        <button
                          type="button"
                          onClick={show}
                          title={t.showOnMap}
                          className="text-left text-[14.5px] font-medium leading-snug underline-offset-2 transition hover:text-brand hover:underline focus-visible:text-brand focus-visible:underline focus-visible:outline-none"
                        >
                          {place.name}
                        </button>
                      ) : (
                        <div className="text-[14.5px] font-medium leading-snug">{place.name}</div>
                      )}
                      {place.description.trim() && <p className="mt-0.5 text-[13px] leading-relaxed text-mute">{place.description.trim()}</p>}
                    </div>
                  </li>
                  )
                })}
              </ol>
            ) : (
              <p className="text-[13px] text-mute">{t.dayEmpty}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
