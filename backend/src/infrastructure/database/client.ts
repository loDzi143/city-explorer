import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { readEnv } from "@/config/env"
import { logger } from "@/infrastructure/logging/logger"
import { AppError } from "@/shared/errors/app-error"

import * as schema from "./schema"

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>
/** A database handle or an open transaction: repositories accept both. */
export type DatabaseExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0]

type DatabaseState = { pool: Pool; db: Database; url: string }

// The pool survives Next.js dev reloads; otherwise every edit would open new connections.
const globalState = globalThis as typeof globalThis & { cityExplorerDatabase?: DatabaseState }
let override: Database | null = null

export function getDb(): Database {
  if (override) return override

  const url = readEnv().DATABASE_URL
  if (!url) {
    throw new AppError("DATABASE_URL is not configured", 503, "Service is temporarily unavailable", "service_unavailable")
  }

  const current = globalState.cityExplorerDatabase
  if (current && current.url === url) return current.db

  const pool = new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000 })
  // An idle client losing its connection must not crash the process.
  pool.on("error", (error) => logger.error(error))
  const db = drizzle(pool, { schema }) as unknown as Database
  globalState.cityExplorerDatabase = { pool, db, url }
  return db
}

/** Replaces the database for tests (an in-memory PGlite instance). Pass null to restore the default. */
export function setDatabase(db: Database | null) {
  override = db
}

export { schema }
