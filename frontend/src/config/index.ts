import { z } from "zod"

const configSchema = z.object({
  apiBaseUrl: z.url(),
})

export const config = configSchema.parse({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000",
})
