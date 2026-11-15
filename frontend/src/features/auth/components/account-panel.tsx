import { useState } from "react"

import { LogOut, UserI } from "@/components/icons"
import { Modal } from "@/components/modal"
import type { Dict } from "@/lib/i18n"
import type { User } from "@/types/account"

function SignOutDialog({ t, onCancel, onConfirm }: { t: Dict; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal label={t.signOutTitle} onClose={onCancel} closeLabel={t.close}>
      <h2 className="font-display text-xl font-semibold tracking-[-0.02em]">{t.signOutTitle}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-mute">{t.signOutBody}</p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 flex-1 rounded-xl border border-line bg-panel text-[15px] font-medium transition hover:bg-hover"
        >
          {t.cancel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="h-11 flex-1 rounded-xl bg-brand text-[15px] font-medium text-brand-ink transition hover:brightness-110 active:scale-[.99]"
        >
          {t.signOut}
        </button>
      </div>
    </Modal>
  )
}

/** Sidebar footer line with the current mode: guest with a sign-in link, or the account with sign-out. */
export function AccountPanel({
  t,
  user,
  collapsed,
  signingOut,
  onSignIn,
  onSignOut,
}: {
  t: Dict
  user: User | null
  collapsed: boolean
  signingOut: boolean
  onSignIn: () => void
  onSignOut: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const rail = "grid size-10 place-items-center rounded-xl text-mute transition hover:bg-hover hover:text-ink disabled:opacity-50"
  const askSignOut = () => setConfirming(true)
  const dialog = confirming && (
    <SignOutDialog
      t={t}
      onCancel={() => setConfirming(false)}
      onConfirm={() => {
        setConfirming(false)
        onSignOut()
      }}
    />
  )

  if (collapsed) {
    return user ? (
      <>
        <button type="button" className={rail} onClick={askSignOut} disabled={signingOut} title={`${user.username} · ${t.signOut}`} aria-label={`${t.signOut} (${user.username})`}>
          <LogOut />
        </button>
        {dialog}
      </>
    ) : (
      <button type="button" className={rail} onClick={onSignIn} title={t.signIn} aria-label={t.signIn}>
        <UserI />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2.5 px-1 pt-1">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-sunk text-mute">
        {user ? <span className="text-[13px] font-semibold text-ink uppercase">{user.username.slice(0, 1)}</span> : <UserI size={16} />}
      </div>
      <div className="min-w-0 flex-1 truncate text-[13px] font-medium">{user ? user.username : t.guestMode}</div>
      {user ? (
        <button
          type="button"
          onClick={askSignOut}
          disabled={signingOut}
          title={t.signOut}
          aria-label={t.signOut}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-hover hover:text-ink disabled:opacity-50"
        >
          <LogOut />
        </button>
      ) : (
        <button type="button" onClick={onSignIn} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-brand transition hover:bg-hover">
          {t.signIn}
        </button>
      )}
      {dialog}
    </div>
  )
}
