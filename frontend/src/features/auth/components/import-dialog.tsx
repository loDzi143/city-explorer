import { Modal } from "@/components/modal"
import type { Dict } from "@/lib/i18n"

/** Asked right after sign-in when trips exist in guest mode. A choice is required: there is no close button. */
export function ImportDialog({
  t,
  tripCount,
  importing,
  failed,
  onImport,
  onSkip,
}: {
  t: Dict
  tripCount: number
  importing: boolean
  failed: boolean
  onImport: () => void
  onSkip: () => void
}) {
  return (
    <Modal label={t.importTitle}>
      <h2 className="font-display text-xl font-semibold tracking-[-0.02em]">{t.importTitle}</h2>
      <p className="mt-2 text-[14px] leading-relaxed">{t.importBody(tripCount)}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-mute">{t.importMoveHint}</p>
      {failed && (
        <p role="alert" className="mt-4 text-[13px] text-red-500">
          {t.importFailed}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={onImport}
          disabled={importing}
          aria-busy={importing}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-medium text-brand-ink transition hover:brightness-110 active:scale-[.99] disabled:opacity-60"
        >
          {importing && <span className="size-4 animate-spin rounded-full border-2 border-brand-ink/40 border-t-brand-ink" aria-hidden="true" />}
          {failed ? t.retry : t.importConfirm}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={importing}
          className="h-11 w-full rounded-xl border border-line bg-panel text-[15px] font-medium transition hover:bg-hover disabled:opacity-60"
        >
          {t.importSkip}
        </button>
      </div>
      <p className="mt-3 text-center text-xs leading-relaxed text-mute">{t.importSkipHint}</p>
    </Modal>
  )
}
