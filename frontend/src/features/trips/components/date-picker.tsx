import { useEffect, useRef, useState } from "react"

import { Chev, Cal } from "@/components/icons"
import { formatDay, parseIso, rangeLabel, toIso } from "@/utils/dates"
import type { Dict } from "@/lib/i18n"

export function DatePicker({
  start,
  end,
  onChange,
  t,
  invalid,
}: {
  start: string | null
  end: string | null
  onChange: (start: string | null, end: string | null) => void
  t: Dict
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const base = start ? parseIso(start) : new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const [hover, setHover] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  const pick = (day: string) => {
    if (!start || end || day <= start) onChange(day, null)
    else {
      onChange(start, day)
      setOpen(false)
    }
  }

  const month = (offset: number) => {
    const first = new Date(view.getFullYear(), view.getMonth() + offset, 1)
    const lead = (first.getDay() + 6) % 7
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const cells: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let day = 1; day <= count; day += 1) cells.push(toIso(new Date(first.getFullYear(), first.getMonth(), day)))
    const rangeEnd = end ?? (start && hover && hover > start ? hover : null)

    return (
      <div className="w-full md:w-[224px]">
        <div className="mb-2 text-center text-sm font-medium">
          {t.months[first.getMonth()]} {first.getFullYear()}
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-mute">
          {t.wd.map((weekday) => (
            <div key={weekday} className="py-1">
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, index) => {
            if (!cell) return <div key={`empty-${first.getMonth()}-${index}`} />
            const isStart = cell === start
            const isEnd = cell === end
            const inRange = Boolean(start && rangeEnd && cell > start && cell < rangeEnd)
            return (
              <div
                key={cell}
                className={`relative ${inRange ? "bg-brand-soft" : ""} ${isStart && rangeEnd ? "rounded-l-full bg-brand-soft" : ""} ${isEnd ? "rounded-r-full bg-brand-soft" : ""}`}
              >
                <button
                  type="button"
                  onMouseEnter={() => setHover(cell)}
                  onClick={() => pick(cell)}
                  className={`grid h-8 w-full place-items-center rounded-full text-[13px] transition ${isStart || isEnd ? "bg-brand font-medium text-brand-ink" : "hover:bg-hover"}`}
                >
                  {Number(cell.slice(8))}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex h-11 w-full items-center gap-2.5 rounded-xl border bg-sunk px-3.5 text-left text-sm transition hover:border-mute/50 focus:outline-none focus:ring-2 focus:ring-brand/40 ${invalid ? "border-red-400" : "border-line"}`}
      >
        <span className="text-mute">
          <Cal />
        </span>
        {start && end ? (
          <span>{rangeLabel(start, end, t)}</span>
        ) : start ? (
          <span>
            {formatDay(start, t)} – <span className="text-mute">{t.pickEnd}</span>
          </span>
        ) : (
          <span className="text-mute">{t.datesPh}</span>
        )}
      </button>
      {open && (
        <div role="dialog" className="absolute left-0 right-0 top-12 z-30 rounded-2xl border border-line bg-panel p-4 shadow-xl md:right-auto md:w-max">
          <div className="flex items-start gap-3">
            <button
              type="button"
              aria-label={t.prevMonth}
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
              className="grid size-7 place-items-center rounded-lg hover:bg-hover"
            >
              <Chev d="l" />
            </button>
            <div className="flex min-w-0 flex-1 gap-6 md:flex-none" onMouseLeave={() => setHover(null)}>
              {month(0)}
              <div className="hidden md:block">{month(1)}</div>
            </div>
            <button
              type="button"
              aria-label={t.nextMonth}
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
              className="grid size-7 place-items-center rounded-lg hover:bg-hover"
            >
              <Chev d="r" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-mute">
            <span>{start && end ? rangeLabel(start, end, t) : start ? t.pickEnd : t.datesPh}</span>
            <button type="button" onClick={() => onChange(null, null)} className="rounded-md px-2 py-1 hover:bg-hover hover:text-ink">
              {t.clear}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
