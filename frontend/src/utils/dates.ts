import type { Dict } from "@/lib/i18n"

export function toIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseIso(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function nightCount(start: string, end: string) {
  return Math.round((parseIso(end).getTime() - parseIso(start).getTime()) / 86_400_000)
}

export function formatDay(value: string, t: Dict) {
  const date = parseIso(value)
  const month = t.mon[date.getMonth()].replace(/^./, (char) => char.toUpperCase())
  return `${month} ${date.getDate()}`
}

export function rangeLabel(start: string, end: string, t: Dict) {
  const days = Math.max(1, nightCount(start, end))
  return `${formatDay(start, t)} – ${formatDay(end, t)} · ${t.days(days)}`
}
