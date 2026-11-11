import { useEffect, useRef, useState } from "react"

import { Cal, Chev } from "@/components/icons"
import type { Dict } from "@/lib/i18n"
import type { Lang } from "@/types/lang"
import { formatMapDay } from "@/utils/dates"

export function MapDaySelect({
  dates,
  disabledDates = [],
  value,
  onChange,
  lang,
  t,
}: {
  dates: string[]
  /** Days shown in the list but not selectable, e.g. days without places. */
  disabledDates?: string[]
  value: string
  onChange: (date: string) => void
  lang: Lang
  t: Dict
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
        aria-label={t.mapDate}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-hover"
      >
        <span className="text-mute">
          <Cal />
        </span>
        <span>{formatMapDay(value, lang, t)}</span>
        <span className={`text-mute transition ${open ? "rotate-180" : ""}`}>
          <Chev d="d" />
        </span>
      </button>
      {open && (
        <div role="listbox" aria-label={t.mapDate} className="absolute top-11 left-0 z-30 min-w-full rounded-xl border border-line bg-panel p-1 shadow-xl">
          {dates.map((date) => {
            const selected = date === value
            const disabled = !selected && disabledDates.includes(date)
            const hintId = `map-day-empty-${date}`
            // aria-disabled instead of disabled: a disabled button gets no hover, so the hint would never show.
            return (
              <div key={date} className="group/day relative">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-disabled={disabled || undefined}
                  aria-describedby={disabled ? hintId : undefined}
                  onClick={() => {
                    if (disabled) return
                    onChange(date)
                    setOpen(false)
                  }}
                  className={`flex h-8 w-full items-center rounded-lg px-2.5 text-left text-[13px] whitespace-nowrap transition ${selected ? "bg-brand-soft font-medium text-ink" : disabled ? "cursor-not-allowed text-mute/50" : "text-ink hover:bg-hover"}`}
                >
                  {formatMapDay(date, lang, t)}
                </button>
                {disabled && (
                  <p
                    id={hintId}
                    role="tooltip"
                    className="pointer-events-none absolute top-1/2 left-[calc(100%+12px)] z-40 -translate-y-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-snug whitespace-nowrap text-bg opacity-0 shadow-lg transition-opacity group-hover/day:opacity-100 group-focus-within/day:opacity-100"
                  >
                    {t.dayEmpty}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
