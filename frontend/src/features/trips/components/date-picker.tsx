import { useEffect, useRef, useState } from "react"

import { Chev, Cal } from "@/components/icons"
import { useMediaQuery } from "@/hooks/use-media-query"
import type { Dict } from "@/lib/i18n"
import { formatDay, parseIso, rangeLabel, toIso } from "@/utils/dates"

export const MAX_TRIP_DURATION_DAYS = 21
const DESKTOP_QUERY = "(min-width: 768px)"

function addDays(iso: string, days: number) {
  const date = parseIso(iso)
  date.setDate(date.getDate() + days)
  return toIso(date)
}

function monthIndex(date: Date) {
  return date.getFullYear() * 12 + date.getMonth()
}

function clampMonth(date: Date, min: Date, max: Date) {
  const index = monthIndex(date)
  if (index < monthIndex(min)) return min
  if (index > monthIndex(max)) return max
  return date
}

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
  const today = toIso(new Date())
  const now = parseIso(today)
  const minMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const maxMonth = new Date(now.getFullYear() + 1, 11, 1)
  const maxDay = toIso(new Date(now.getFullYear() + 1, 11, 31))
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const visibleMonths = desktop ? 2 : 1
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const current = new Date()
    const min = new Date(current.getFullYear(), current.getMonth(), 1)
    const max = new Date(current.getFullYear() + 1, 11, 1)
    const base = start ? parseIso(start) : current
    return clampMonth(new Date(base.getFullYear(), base.getMonth(), 1), min, max)
  })
  const [hover, setHover] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const choosingEnd = Boolean(start && !end && start >= today)
  const latestEnd = choosingEnd && start ? addDays(start, MAX_TRIP_DURATION_DAYS) : null
  const canGoPrev = monthIndex(view) > monthIndex(minMonth)
  const canGoNext = monthIndex(view) + visibleMonths <= monthIndex(maxMonth)
  const showNextMonth = desktop && monthIndex(view) + 1 <= monthIndex(maxMonth)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  const unavailable = (day: string) => day < today || day > maxDay || (latestEnd !== null && day > latestEnd)

  const pick = (day: string) => {
    if (unavailable(day)) return
    if (!start || end || day <= start) onChange(day, null)
    else {
      onChange(start, day)
      setOpen(false)
    }
  }

  const shiftView = (offset: number) => {
    if ((offset < 0 && !canGoPrev) || (offset > 0 && !canGoNext)) return
    setView(new Date(view.getFullYear(), view.getMonth() + offset, 1))
  }

  const month = (offset: number) => {
    const first = new Date(view.getFullYear(), view.getMonth() + offset, 1)
    const lead = (first.getDay() + 6) % 7
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const cells: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let day = 1; day <= count; day += 1) cells.push(toIso(new Date(first.getFullYear(), first.getMonth(), day)))
    const rangeEnd = end ?? (start && hover && hover > start && !unavailable(hover) ? hover : null)

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
            const disabled = unavailable(cell)
            const isStart = cell === start
            const isEnd = cell === end
            const inRange = !disabled && Boolean(start && rangeEnd && cell > start && cell < rangeEnd)
            const selected = !disabled && (isStart || isEnd)
            return (
              <div
                key={cell}
                className={`relative ${inRange ? "bg-brand-soft" : ""} ${!disabled && isStart && rangeEnd ? "rounded-l-full bg-brand-soft" : ""} ${!disabled && isEnd ? "rounded-r-full bg-brand-soft" : ""}`}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onMouseEnter={() => setHover(cell)}
                  onClick={() => pick(cell)}
                  className={`grid h-8 w-full place-items-center rounded-full text-[13px] transition disabled:cursor-not-allowed disabled:text-mute/40 ${selected ? "bg-brand font-medium text-brand-ink" : disabled ? "" : "hover:bg-hover"}`}
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
              disabled={!canGoPrev}
              onClick={() => shiftView(-1)}
              className="grid size-7 place-items-center rounded-lg hover:bg-hover disabled:pointer-events-none disabled:opacity-30"
            >
              <Chev d="l" />
            </button>
            <div className="flex min-w-0 flex-1 gap-6 md:flex-none" onMouseLeave={() => setHover(null)}>
              {month(0)}
              {showNextMonth && month(1)}
            </div>
            <button
              type="button"
              aria-label={t.nextMonth}
              disabled={!canGoNext}
              onClick={() => shiftView(1)}
              className="grid size-7 place-items-center rounded-lg hover:bg-hover disabled:pointer-events-none disabled:opacity-30"
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
