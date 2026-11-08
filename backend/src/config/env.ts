import { z } from "zod"

const mapTilerKeySchema = z.string().trim().min(1)
const geocodingUrlSchema = z.url()

export function readMapTilerKey(): string | null {
  const parsed = mapTilerKeySchema.safeParse(process.env.MAPTILER_KEY)
  return parsed.success ? parsed.data : null
}

export function readGeocodingUrl(): string | null {
  const value = process.env.GEOCODING_URL?.trim().replace(/\/+$/, "")
  const parsed = geocodingUrlSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
