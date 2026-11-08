import { z } from "zod"

const envSchema = z.object({
  MAPTILER_KEY: z.string().trim().min(1).nullable().catch(null),
  GEOCODING_URL: z
    .string()
    .trim()
    .transform((value) => value.replace(/\/+$/, ""))
    .pipe(z.url())
    .nullable()
    .catch(null),
  OPENROUTER_API_KEY: z.string().trim().min(1).nullable().catch(null),
  OPENROUTER_MODEL: z.string().trim().min(1).nullable().catch(null),
  OPENROUTER_COMPLETIONS_URL: z
    .string()
    .trim()
    .transform((value) => value.replace(/\/+$/, ""))
    .pipe(z.url())
    .nullable()
    .catch(null),
})

export type Env = z.infer<typeof envSchema>

export function readEnv(): Env {
  return envSchema.parse(process.env)
}
