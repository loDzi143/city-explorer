import { Compass } from "@/components/icons"
import type { Dict } from "@/lib/i18n"

/** The account couldn't be loaded. Shown instead of guest data, which would be the wrong data. */
export function AccountError({ t, onRetry, onGuest }: { t: Dict; onRetry: () => void; onGuest: () => void }) {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-bg px-4 text-ink">
      <div className="w-full max-w-[420px] text-center">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
          <Compass size={22} />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.03em]">{t.accountErrorTitle}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-mute">{t.accountErrorBody}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-7 h-12 w-full rounded-xl bg-brand text-[15px] font-medium text-brand-ink transition hover:brightness-110 active:scale-[.99]"
        >
          {t.retry}
        </button>
        <button type="button" onClick={onGuest} className="mt-2 w-full rounded-lg py-2 text-[13px] text-mute transition hover:text-ink">
          {t.continueAsGuest}
        </button>
      </div>
    </div>
  )
}
