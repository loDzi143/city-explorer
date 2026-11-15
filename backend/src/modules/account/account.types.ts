import type { Language } from "@/shared/types/language"

export const themes = ["light", "dark"] as const

export type Theme = (typeof themes)[number]

export type AccountSettings = {
  language: Language
  theme: Theme
}

export type PublicUser = {
  id: string
  username: string
  createdAt: string
}

/** What /api/auth/register, /api/auth/login and /api/auth/me return. */
export type AccountSnapshot = {
  user: PublicUser
  settings: AccountSettings
}

export type Credentials = {
  username: string
  password: string
}

export type RegisterInput = Credentials & {
  settings?: Partial<AccountSettings>
}

/** Successful login or registration: the account plus the raw session token for the cookie. */
export type SignedIn = AccountSnapshot & {
  token: string
}

export type AuthenticatedSession = {
  user: PublicUser
  sessionId: string
  /** The session was extended; the cookie should be re-sent with a fresh Max-Age. */
  renewed: boolean
}

export type ClientInfo = {
  /** Client IP or another stable key used for rate limiting. */
  ip: string
}
