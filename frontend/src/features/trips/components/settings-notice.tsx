import type { ReactNode } from "react"

import { Settings } from "@/components/icons"
import type { Dict } from "@/lib/i18n"
import type { ChatMessage } from "@/types/chat"
import { rangeLabel } from "@/utils/dates"

import { parseSettingsUpdate } from "../utils/settings-update"

export function SettingsNotice({ message, t }: { message: ChatMessage; t: Dict }) {
  const update = message.update ?? parseSettingsUpdate(message.text)
  if (!update) return null

  const value = (text: string | null) => (text ? text : <span className="text-mute">{t.notSet}</span>)
  const rows: [string, ReactNode][] = []
  if (update.dates) {
    const { start, end } = update.dates
    rows.push([t.dates, value(start && end ? rangeLabel(start, end, t) : null)])
  }
  if (update.hotel !== undefined) rows.push([t.summaryHotel, value(update.hotel)])
  if (update.prefs !== undefined) rows.push([t.summaryPrefs, value(update.prefs)])

  return (
    <div role="status" className="flex justify-center">
      <div className="w-full max-w-[480px] rounded-xl border border-dashed border-line px-4 py-3 text-[13px]">
        <div className="flex items-center gap-2 font-medium text-mute">
          <Settings />
          {t.tripUpdated}
        </div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pl-6">
          {rows.map(([label, content]) => (
            <div key={label} className="contents">
              <dt className="text-mute">{label}</dt>
              <dd className="min-w-0 break-words">{content}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
