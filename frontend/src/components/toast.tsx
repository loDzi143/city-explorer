import type { ReactNode } from "react"

import { Cross } from "@/components/icons"

/** A short status line at the bottom of the screen with an optional action. */
export function Toast({
  children,
  action,
  onAction,
  onClose,
  closeLabel,
  tone = "neutral",
}: {
  children: ReactNode
  action?: string
  onAction?: () => void
  onClose?: () => void
  closeLabel?: string
  tone?: "neutral" | "error"
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <div
        role={tone === "error" ? "alert" : "status"}
        className="pointer-events-auto flex max-w-[560px] items-center gap-3 rounded-xl border border-line bg-panel py-2 pr-2 pl-4 text-[13px] shadow-lg"
      >
        <span className={tone === "error" ? "text-red-500" : "text-ink"}>{children}</span>
        {action && onAction && (
          <button type="button" onClick={onAction} className="shrink-0 rounded-lg px-2.5 py-1.5 font-medium text-brand transition hover:bg-hover">
            {action}
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="grid size-7 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-hover hover:text-ink">
            <Cross size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
