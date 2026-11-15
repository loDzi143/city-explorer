import { eq, lt, sql } from "drizzle-orm"

import { getDb, schema, type Database, type DatabaseExecutor } from "@/infrastructure/database/client"
import { isUniqueViolation } from "@/infrastructure/database/errors"

import type { AccountSettings, PublicUser } from "./account.types"

const { sessions, userSettings, users } = schema

export type UserRecord = PublicUser & { passwordHash: string }

export type SessionRecord = {
  id: string
  user: PublicUser
  expiresAt: Date
  lastActivityAt: Date
}

function toPublicUser(row: { id: string; username: string; createdAt: Date }): PublicUser {
  return { id: row.id, username: row.username, createdAt: row.createdAt.toISOString() }
}

export function createAccountRepository(database: () => Database = getDb) {
  return {
    /** Creates the user, their settings and the first session atomically. */
    async createUser(input: {
      username: string
      passwordHash: string
      settings: AccountSettings
      session: { tokenHash: string; expiresAt: Date }
    }): Promise<{ ok: true; user: PublicUser; settings: AccountSettings } | { ok: false; reason: "username_taken" }> {
      try {
        return await database().transaction(async (tx) => {
          const [user] = await tx
            .insert(users)
            .values({ username: input.username, passwordHash: input.passwordHash })
            .returning({ id: users.id, username: users.username, createdAt: users.createdAt })
          await tx.insert(userSettings).values({ userId: user.id, ...input.settings })
          await tx.insert(sessions).values({ userId: user.id, tokenHash: input.session.tokenHash, expiresAt: input.session.expiresAt })
          return { ok: true as const, user: toPublicUser(user), settings: input.settings }
        })
      } catch (error) {
        if (isUniqueViolation(error, "users_username_key")) return { ok: false, reason: "username_taken" }
        throw error
      }
    },

    async findUserByUsername(username: string): Promise<UserRecord | null> {
      const [row] = await database()
        .select({ id: users.id, username: users.username, createdAt: users.createdAt, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.username, username))
        .limit(1)
      return row ? { ...toPublicUser(row), passwordHash: row.passwordHash } : null
    },

    async createSession(userId: string, tokenHash: string, expiresAt: Date) {
      const db = database()
      // Expired sessions are useless; dropping them here keeps the table small without a cron job.
      await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`))
      await db.insert(sessions).values({ userId, tokenHash, expiresAt })
    },

    async findSession(tokenHash: string): Promise<SessionRecord | null> {
      const [row] = await database()
        .select({
          id: sessions.id,
          expiresAt: sessions.expiresAt,
          lastActivityAt: sessions.lastActivityAt,
          userId: users.id,
          username: users.username,
          userCreatedAt: users.createdAt,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1)
      if (!row) return null
      return {
        id: row.id,
        expiresAt: row.expiresAt,
        lastActivityAt: row.lastActivityAt,
        user: toPublicUser({ id: row.userId, username: row.username, createdAt: row.userCreatedAt }),
      }
    },

    async touchSession(sessionId: string, lastActivityAt: Date, expiresAt: Date) {
      await database().update(sessions).set({ lastActivityAt, expiresAt }).where(eq(sessions.id, sessionId))
    },

    async deleteSession(sessionId: string) {
      await database().delete(sessions).where(eq(sessions.id, sessionId))
    },

    async deleteSessionByTokenHash(tokenHash: string) {
      await database().delete(sessions).where(eq(sessions.tokenHash, tokenHash))
    },

    async deleteUserSessions(userId: string) {
      await database().delete(sessions).where(eq(sessions.userId, userId))
    },

    async getSettings(userId: string, executor?: DatabaseExecutor): Promise<AccountSettings | null> {
      const [row] = await (executor ?? database())
        .select({ language: userSettings.language, theme: userSettings.theme })
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1)
      return row ?? null
    },

    /** Upsert: an account created before settings existed still gets a row. */
    async updateSettings(userId: string, patch: Partial<AccountSettings>, defaults: AccountSettings): Promise<AccountSettings> {
      const [row] = await database()
        .insert(userSettings)
        .values({ userId, ...defaults, ...patch })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: { ...patch, updatedAt: sql`now()` },
        })
        .returning({ language: userSettings.language, theme: userSettings.theme })
      return row
    },
  }
}

export type AccountRepository = ReturnType<typeof createAccountRepository>

export const accountRepository = createAccountRepository()
