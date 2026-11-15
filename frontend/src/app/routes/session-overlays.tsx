import { Toast } from "@/components/toast"
import { AuthDialog, ImportDialog, type AuthMode } from "@/features/auth"
import type { Dict } from "@/lib/i18n"
import { useChatStore } from "@/stores/chat-store"
import { useSessionStore } from "@/stores/session-store"

/**
 * Everything the workspace shows on top of itself about the account: the sign-in dialog, the offer
 * to move guest trips, and notices about saving, signing out and an ended session.
 */
export function SessionOverlays({
  t,
  authMode,
  onAuthMode,
}: {
  t: Dict
  /** The dialog the user opened; null when they opened none. */
  authMode: AuthMode | null
  onAuthMode: (mode: AuthMode | null) => void
}) {
  const status = useSessionStore((state) => state.status)
  const expired = useSessionStore((state) => state.expired)
  const importOffer = useSessionStore((state) => state.importOffer)
  const signOutFailed = useSessionStore((state) => state.signOutFailed)
  const login = useSessionStore((state) => state.login)
  const register = useSessionStore((state) => state.register)
  const logout = useSessionStore((state) => state.logout)
  const continueAsGuest = useSessionStore((state) => state.continueAsGuest)
  const importGuestData = useSessionStore((state) => state.importGuestData)
  const skipImport = useSessionStore((state) => state.skipImport)
  const dismissExpired = useSessionStore((state) => state.dismissExpired)
  const syncError = useChatStore((state) => state.syncError)
  const retrySync = useChatStore((state) => state.retrySync)

  // A session that expired while signed in asks to sign in again; closing the dialog switches to guest mode.
  const reauth = status === "account" && expired
  const authOpen: AuthMode | null = authMode ?? (reauth ? "login" : null)
  const closeAuth = () => {
    onAuthMode(null)
    if (reauth) continueAsGuest()
  }
  const signedIn = <T extends { ok: boolean }>(result: T) => {
    if (result.ok) onAuthMode(null)
    return result
  }

  return (
    <>
      {authOpen && !importOffer && (
        <AuthDialog
          t={t}
          mode={authOpen}
          notice={reauth ? t.sessionExpired : null}
          onMode={onAuthMode}
          onClose={closeAuth}
          onLogin={async (credentials) => signedIn(await login(credentials))}
          onRegister={async (credentials) => signedIn(await register(credentials))}
        />
      )}
      {importOffer && (
        <ImportDialog
          t={t}
          tripCount={importOffer.tripCount}
          importing={importOffer.importing}
          failed={importOffer.failed}
          onImport={() => void importGuestData()}
          onSkip={() => void skipImport()}
        />
      )}
      {syncError && status === "account" ? (
        <Toast tone="error" action={t.retry} onAction={retrySync}>
          {syncError.offline ? t.syncOffline : t.syncFailed}
        </Toast>
      ) : signOutFailed ? (
        <Toast tone="error" action={t.retry} onAction={() => void logout()}>
          {t.signOutFailed}
        </Toast>
      ) : status === "guest" && expired ? (
        <Toast action={t.signIn} onAction={() => onAuthMode("login")} onClose={dismissExpired} closeLabel={t.close}>
          {t.sessionEnded}
        </Toast>
      ) : null}
    </>
  )
}
