// Test-only: an in-memory PostgreSQL (PGlite) with the real migrations applied.
import { fileURLToPath } from "node:url"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"

import { schema, setDatabase, type Database } from "./client"

const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url))

export async function createTestDatabase() {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  const database = db as unknown as Database
  setDatabase(database)
  return {
    db: database,
    client,
    /** Empties every table; users cascade to sessions, settings, trips, messages and plans. */
    async reset() {
      await client.exec("TRUNCATE users CASCADE")
    },
    async close() {
      setDatabase(null)
      await client.close()
    },
  }
}
