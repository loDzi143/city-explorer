import { defineConfig } from "drizzle-kit"

// drizzle-kit runs outside Next.js, so .env is loaded here explicitly.
try {
  process.loadEnvFile(".env")
} catch {
  // No .env file: DATABASE_URL must come from the environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/database/schema.ts",
  out: "./src/infrastructure/database/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
})
