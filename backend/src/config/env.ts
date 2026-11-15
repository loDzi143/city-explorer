import { z } from "zod"

const url = z
  .string()
  .trim()
  .transform((value) => value.replace(/\/+$/, ""))
  .pipe(z.url())

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).catch("development"),
  MAPTILER_KEY: z.string().trim().min(1).nullable().catch(null),
  GEOCODING_URL: url.nullable().catch(null),
  OPENROUTER_API_KEY: z.string().trim().min(1).nullable().catch(null),
  OPENROUTER_MODEL: z.string().trim().min(1).nullable().catch(null),
  OPENROUTER_COMPLETIONS_URL: url.nullable().catch(null),
  DATABASE_URL: z
    .string()
    .trim()
    .regex(/^postgres(ql)?:\/\//)
    .nullable()
    .catch(null),
  /** Comma-separated browser origins allowed to call the API with cookies. Localhost is always allowed outside production. */
  CORS_ORIGINS: z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter((origin) => /^https?:\/\/[^/]+$/.test(origin)),
    )
    .catch([]),
  /**
   * How many trusted reverse proxies stand in front of the backend: `false` (0), `true` (1) or a number.
   * Each proxy appends the address it saw to X-Forwarded-For, so the client is that many entries from the end.
   */
  TRUST_PROXY: z
    .string()
    .transform((value) => {
      const text = value.trim().toLowerCase()
      if (text === "true") return 1
      return /^\d{1,2}$/.test(text) ? Number(text) : 0
    })
    .catch(0),
})

export type Env = z.infer<typeof envSchema>

export function readEnv(): Env {
  return envSchema.parse(process.env)
}
