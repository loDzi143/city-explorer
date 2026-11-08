import type { Place } from "@/types/place"

export type TripPlace = Place & { flag: string }

export function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false
  const place = value as Place
  return (
    typeof place.id === "string" &&
    place.id.length > 0 &&
    typeof place.city === "string" &&
    typeof place.country === "string" &&
    (place.countryCode === null || typeof place.countryCode === "string") &&
    Number.isFinite(place.longitude) &&
    Number.isFinite(place.latitude) &&
    (place.bbox === null || isBbox(place.bbox))
  )
}

function isBbox(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every((coord) => typeof coord === "number" && Number.isFinite(coord))
}

export function flagEmoji(code: string | null | undefined) {
  if (!code || !/^[a-z]{2}$/i.test(code)) return "✦"
  return [...code.toUpperCase()].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("")
}

export function tripPlace(chat: { place?: Place | null }): TripPlace | null {
  if (!chat.place) return null
  return { ...chat.place, flag: flagEmoji(chat.place.countryCode) }
}
