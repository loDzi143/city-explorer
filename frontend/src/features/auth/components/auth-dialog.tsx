import { useState, type FormEvent } from "react"

import { Compass } from "@/components/icons"
import { Modal } from "@/components/modal"
import type { Dict } from "@/lib/i18n"
import type { AuthErrorReason, AuthResult } from "@/stores/session-store"

import { validateLogin, validateRegistration, type CredentialsError } from "../utils/validate"

export type AuthMode = "login" | "register"

type Credentials = { username: string; password: string }

function validationMessage(error: CredentialsError, t: Dict) {
  switch (error) {
    case "required":
      return t.errRequired
    case "username":
      return t.errUsername
    case "passwordShort":
      return t.errPasswordShort
    case "passwordLong":
      return t.errPasswordLong
    case "passwordMatch":
      return t.errPasswordMatch
    case "passwordSame":
      return t.errPasswordSame
  }
}

function failureMessage(reason: AuthErrorReason, t: Dict) {
  switch (reason) {
    case "invalid_credentials":
      return t.authInvalid
    case "username_taken":
      return t.authTaken
    case "rate_limited":
      return t.authRateLimited
    case "network":
      return t.authNetwork
    case "validation":
      return t.authValidation
    case "server":
      return t.authServer
  }
}

export function AuthDialog({
  t,
  mode,
  notice,
  onMode,
  onClose,
  onLogin,
  onRegister,
}: {
  t: Dict
  mode: AuthMode
  /** Shown above the form, e.g. why the user has to sign in again. */
  notice?: string | null
  onMode: (mode: AuthMode) => void
  onClose: () => void
  onLogin: (credentials: Credentials) => Promise<AuthResult>
  onRegister: (credentials: Credentials) => Promise<AuthResult>
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const registering = mode === "register"

  const switchMode = (next: AuthMode) => {
    setError(null)
    setConfirm("")
    onMode(next)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    const invalid = registering ? validateRegistration(username, password, confirm) : validateLogin(username, password)
    if (invalid) {
      setError(validationMessage(invalid, t))
      return
    }
    setError(null)
    setPending(true)
    const credentials = { username: username.trim(), password }
    const result = registering ? await onRegister(credentials) : await onLogin(credentials)
    setPending(false)
    if (!result.ok) {
      setError(failureMessage(result.reason, t))
      if (result.reason === "invalid_credentials") setPassword("")
    }
  }

  const field =
    "h-11 w-full rounded-xl border border-line bg-sunk px-3.5 text-sm placeholder:text-mute transition hover:border-mute/50 focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
  const label = "mb-1.5 block text-[13px] font-medium"
  const title = registering ? t.signUpTitle : t.signInTitle

  return (
    <Modal label={title} onClose={pending ? undefined : onClose} closeLabel={t.close}>
      <div className="mb-4 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
        <Compass size={20} />
      </div>
      <h2 className="font-display text-xl font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-mute">{t.authSub}</p>
      {notice && <p className="mt-4 rounded-xl border border-line bg-sunk px-3.5 py-2.5 text-[13px]">{notice}</p>}

      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        <div>
          <label className={label} htmlFor="auth-username">
            {t.username}
          </label>
          <input
            id="auth-username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            value={username}
            disabled={pending}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={t.usernamePh}
            className={field}
          />
          {registering && <p className="mt-1.5 text-xs text-mute">{t.usernameHelp}</p>}
        </div>
        <div>
          <label className={label} htmlFor="auth-password">
            {t.password}
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={registering ? "new-password" : "current-password"}
            maxLength={128}
            value={password}
            disabled={pending}
            onChange={(event) => setPassword(event.target.value)}
            className={field}
          />
          {registering && <p className="mt-1.5 text-xs text-mute">{t.passwordHelp}</p>}
        </div>
        {registering && (
          <div>
            <label className={label} htmlFor="auth-confirm">
              {t.confirmPassword}
            </label>
            <input
              id="auth-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              maxLength={128}
              value={confirm}
              disabled={pending}
              onChange={(event) => setConfirm(event.target.value)}
              className={field}
            />
          </div>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-red-500">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-medium text-brand-ink transition hover:brightness-110 active:scale-[.99] disabled:opacity-60"
        >
          {pending && <span className="size-4 animate-spin rounded-full border-2 border-brand-ink/40 border-t-brand-ink" aria-hidden="true" />}
          {registering ? t.signUp : t.signIn}
        </button>
      </form>

      <p className="mt-4 text-center text-[13px] text-mute">
        {registering ? t.haveAccount : t.noAccount}{" "}
        <button
          type="button"
          disabled={pending}
          onClick={() => switchMode(registering ? "login" : "register")}
          className="font-medium text-brand underline-offset-2 hover:underline"
        >
          {registering ? t.signIn : t.signUp}
        </button>
      </p>
      <button type="button" disabled={pending} onClick={onClose} className="mt-2 w-full rounded-lg py-2 text-[13px] text-mute transition hover:text-ink">
        {t.continueAsGuest}
      </button>
    </Modal>
  )
}
