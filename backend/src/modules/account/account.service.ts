import { createMemoryRateLimiter, type RateLimiter } from "@/infrastructure/cache/rate-limiter"
import { AppError } from "@/shared/errors/app-error"
import { RateLimitError } from "@/shared/errors/rate-limit-error"
import { SESSION_TTL_SECONDS } from "@/shared/http/session-cookie"

import { accountRepository, type AccountRepository } from "./account.repository"
import type {
  AccountSettings,
  AccountSnapshot,
  AuthenticatedSession,
  ClientInfo,
  Credentials,
  RegisterInput,
  SignedIn,
} from "./account.types"
import { hashPassword, verifyDummyPassword, verifyPassword } from "./password"
import { generateSessionToken, hashSessionToken } from "./session-token"

const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000
/** A session is extended at most once per interval, so active users don't write on every request. */
const RENEW_INTERVAL_MS = 60 * 60 * 1000

/** Matches the frontend defaults when the browser gives no preference. */
export const DEFAULT_SETTINGS: AccountSettings = { language: "en", theme: "light" }

function invalidCredentials() {
  return new AppError("Invalid username or password", 401, "Invalid username or password", "invalid_credentials")
}

export type AccountServiceOptions = {
  repository?: AccountRepository
  now?: () => number
  limiters?: {
    loginByIp?: RateLimiter
    loginByUsername?: RateLimiter
    registerByIp?: RateLimiter
  }
}

export function createAccountService(options: AccountServiceOptions = {}) {
  const repository = options.repository ?? accountRepository
  const now = options.now ?? Date.now
  const loginByIp = options.limiters?.loginByIp ?? createMemoryRateLimiter({ limit: 20, windowMs: 15 * 60_000 })
  const loginByUsername = options.limiters?.loginByUsername ?? createMemoryRateLimiter({ limit: 10, windowMs: 15 * 60_000 })
  const registerByIp = options.limiters?.registerByIp ?? createMemoryRateLimiter({ limit: 10, windowMs: 60 * 60_000 })

  function limit(limiter: RateLimiter, key: string) {
    const result = limiter.hit(key)
    if (!result.allowed) throw new RateLimitError(`Rate limit exceeded for ${key.split(":")[0]}`, result.retryAfterSeconds)
  }

  function newSession() {
    const token = generateSessionToken()
    return { token, tokenHash: hashSessionToken(token), expiresAt: new Date(now() + SESSION_TTL_MS) }
  }

  return {
    async register(input: RegisterInput, client: ClientInfo): Promise<SignedIn> {
      limit(registerByIp, `register:${client.ip}`)
      const session = newSession()
      const created = await repository.createUser({
        username: input.username,
        passwordHash: await hashPassword(input.password),
        settings: { ...DEFAULT_SETTINGS, ...input.settings },
        session: { tokenHash: session.tokenHash, expiresAt: session.expiresAt },
      })
      if (!created.ok) {
        throw new AppError("Username is taken", 409, "This username is already taken", "username_taken")
      }
      return { user: created.user, settings: created.settings, token: session.token }
    },

    async login(credentials: Credentials, client: ClientInfo): Promise<SignedIn> {
      limit(loginByIp, `login-ip:${client.ip}`)
      limit(loginByUsername, `login-user:${credentials.username}`)

      const user = credentials.username ? await repository.findUserByUsername(credentials.username) : null
      const valid = user ? await verifyPassword(user.passwordHash, credentials.password) : await verifyDummyPassword(credentials.password)
      // One message for "no such user" and "wrong password": the response must not reveal which usernames exist.
      if (!user || !valid) throw invalidCredentials()

      loginByUsername.reset(`login-user:${credentials.username}`)
      const session = newSession()
      await repository.createSession(user.id, session.tokenHash, session.expiresAt)
      const settings = (await repository.getSettings(user.id)) ?? DEFAULT_SETTINGS
      return {
        user: { id: user.id, username: user.username, createdAt: user.createdAt },
        settings,
        token: session.token,
      }
    },

    /** Resolves a cookie token to its session. Expired sessions are deleted and treated as missing. */
    async authenticate(token: string | null): Promise<AuthenticatedSession | null> {
      if (!token) return null
      const session = await repository.findSession(hashSessionToken(token))
      if (!session) return null

      const time = now()
      if (session.expiresAt.getTime() <= time) {
        await repository.deleteSession(session.id)
        return null
      }

      const renewed = time - session.lastActivityAt.getTime() >= RENEW_INTERVAL_MS
      if (renewed) {
        await repository.touchSession(session.id, new Date(time), new Date(time + SESSION_TTL_MS))
      }
      return { user: session.user, sessionId: session.id, renewed }
    },

    async me(session: AuthenticatedSession): Promise<AccountSnapshot> {
      const settings = (await repository.getSettings(session.user.id)) ?? DEFAULT_SETTINGS
      return { user: session.user, settings }
    },

    /** Ends the session behind the token, if any. Logging out without a valid session is not an error. */
    async logout(token: string | null) {
      if (!token) return
      await repository.deleteSessionByTokenHash(hashSessionToken(token))
    },

    /** Ends every session of the user, the current one included. */
    async revokeAllSessions(userId: string) {
      await repository.deleteUserSessions(userId)
    },

    async getSettings(userId: string): Promise<AccountSettings> {
      return (await repository.getSettings(userId)) ?? DEFAULT_SETTINGS
    },

    async updateSettings(userId: string, patch: Partial<AccountSettings>): Promise<AccountSettings> {
      return repository.updateSettings(userId, patch, DEFAULT_SETTINGS)
    },
  }
}

export type AccountService = ReturnType<typeof createAccountService>

export const accountService = createAccountService()
