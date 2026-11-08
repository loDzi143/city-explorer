import { z } from "zod"

import { api } from "@/lib/api"
import type { Lang } from "@/types/lang"
import type { Place } from "@/types/place"

const placeSchema = z.object({
  id: z.string().min(1),
  city: z.string(),
  country: z.string(),
  countryCode: z.string().nullable(),
  longitude: z.number(),
  latitude: z.number(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
})

export async function suggestLocations(query: string, language: Lang): Promise<Place[]> {
  const { data } = await api.get("/api/locations/suggest", {
    params: { query, language },
  })
  return placeSchema.array().parse(data)
}
