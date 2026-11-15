import { useEffect, useRef, type ReactNode } from "react"

import { Cross } from "@/components/icons"

/** Centered dialog over a dimmed page. `onClose` is omitted for dialogs that require a choice. */
export function Modal({
  label,
  onClose,
  closeLabel,
  children,
}: {
  label: string
  onClose?: () => void
  closeLabel?: string
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = panel.current?.querySelector<HTMLElement>("input, button:not([data-close])")
    first?.focus()
    return () => previous?.focus()
  }, [])

  useEffect(() => {
    if (!onClose) return
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", close)
    return () => document.removeEventListener("keydown", close)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px]">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative max-h-full w-full max-w-[420px] overflow-y-auto rounded-2xl border border-line bg-panel p-6 text-ink shadow-xl"
      >
        {onClose && (
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            className="absolute top-3 right-3 grid size-8 place-items-center rounded-lg text-mute transition hover:bg-hover hover:text-ink"
          >
            <Cross size={16} />
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
