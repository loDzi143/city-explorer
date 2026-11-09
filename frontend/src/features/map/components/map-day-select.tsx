import { useEffect, useRef, useState } from "react"

import { Cal, Chev } from "@/components/icons"
import type { Dict } from "@/lib/i18n"
import type { Lang } from "@/types/lang"
import { formatMapDay } from "@/utils/dates"

export function MapDaySelect({
  dates,
  value,
  onChange,
  lang,
  t,
}: {
  dates: string[]
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
            return (
              <button
                key={date}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(date)
                  setOpen(false)
                }}
                className={`flex h-8 w-full items-center rounded-lg px-2.5 text-left text-[13px] whitespace-nowrap transition ${selected ? "bg-brand-soft font-medium text-ink" : "text-ink hover:bg-hover"}`}
              >
                {formatMapDay(date, lang, t)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
