import { describe, expect, it } from "vitest"

import { parseLegacyChat, parseTrip, parseTrips } from "@/utils/trip-codec"
import { needsReply, unanswered } from "@/utils/trip-messages"

const place = { id: "poi.1", name: "Tile Museum", description: "", coordinates: { latitude: 38.72, longitude: -9.11 } }
const stored = {
  id: "trip-1",
  name: "Lisbon",
  details: { cityId: "place.lisbon", start: "2026-12-01", end: "2026-12-02", hotel: "", prefs: "" },
  place: { id: "place.lisbon", city: "Lisbon", country: "Portugal", countryCode: "pt", longitude: -9.14, latitude: 38.72, bbox: null },
  messages: [{ id: "m1", role: "ai", text: "Olá" }],
  hints: ["Add museums", "", 7],
  plans: [{ date: "2026-11-01T10:00:00.000Z", start: "2026-12-01", end: "2026-12-02", days: [{ date: "2026-12-01", places: [place] }] }],
  conversationContext: { activeTopic: " Food ", pendingQuestion: "", discussedOptions: ["A", 1], unresolvedReferences: null },
}

describe("reading stored trips", () => {
  it("reads a trip and normalizes what a model or an older version wrote", () => {
    const trip = parseTrip({ ...stored, version: 4, updatedAt: "2026-11-15T10:00:00.000Z" })

    expect(trip).toMatchObject({ id: "trip-1", name: "Lisbon", version: 4, updatedAt: "2026-11-15T10:00:00.000Z" })
    expect(trip?.hints).toEqual(["Add museums"])
    expect(trip?.conversationContext).toEqual({ activeTopic: "Food", pendingQuestion: null, discussedOptions: ["A"], unresolvedReferences: [] })
    expect(trip?.plans[0]?.days[0]?.places).toEqual([place])
  })

  it("drops broken places, days and plans but keeps the trip", () => {
    const trip = parseTrip({
      ...stored,
      place: { id: "place.lisbon", city: "Lisbon" },
      plans: [
        { date: "not a date", start: null, end: null, days: [] },
        {
          date: "2026-11-01T10:00:00.000Z",
          start: null,
          end: null,
          days: [{ date: "2026-12-01", places: [place, { ...place, coordinates: { latitude: "38.7", longitude: -9.1 } }, { ...place, id: " " }] }, { date: "tomorrow", places: [place] }],
        },
      ],
    })

    expect(trip?.place).toBeNull()
    expect(trip?.plans).toHaveLength(1)
    expect(trip?.plans[0]?.days).toEqual([{ date: "2026-12-01", places: [place] }])
  })

  it("rejects a trip whose identity or conversation can't be trusted, without losing the others", () => {
    expect(parseTrip({ ...stored, id: 5 })).toBeNull()
    expect(parseTrip({ ...stored, details: null })).toBeNull()
    expect(parseTrip({ ...stored, messages: [{ id: "m1", role: "robot", text: "?" }] })).toBeNull()
    expect(parseTrips([stored, null, { ...stored, id: 5 }, { ...stored, id: "trip-2" }]).map((trip) => trip.id)).toEqual(["trip-1", "trip-2"])
    expect(parseTrips("not a list")).toEqual([])
  })

  it("converts a chat saved before plans had versions", () => {
    const trip = parseLegacyChat({
      id: "chat-1",
      name: "Lisbon",
      cityId: "place.lisbon",
      start: "2026-12-01",
      end: "2026-12-02",
      hotel: "",
      prefs: "",
      place: stored.place,
      messages: [{ id: "m1", role: "ai", text: { en: "Hello", ru: "Привет" } }],
      tripDays: [{ date: "2026-12-01", places: [place] }],
    })

    expect(trip?.messages?.[0]?.text).toBe("Hello")
    expect(trip?.plans).toHaveLength(1)
    expect(trip?.plans[0]).toMatchObject({ start: "2026-12-01", end: "2026-12-02", days: [{ date: "2026-12-01", places: [place] }] })
  })
})

describe("what waits for the assistant", () => {
  const ai = { id: "a", role: "ai" as const, text: "Hi" }
  const user = { id: "u", role: "user" as const, text: "More" }
  const notice = { id: "s", role: "system" as const, text: "", update: { hotel: "Ritz" } }

  it("needs a reply for an empty chat, a user message or a settings change, not after an answer", () => {
    expect(needsReply([])).toBe(true)
    expect(needsReply([ai, user])).toBe(true)
    expect(needsReply([ai, notice])).toBe(true)
    expect(needsReply([ai, user, ai])).toBe(false)
  })

  it("returns everything after the last answer", () => {
    expect(unanswered([ai, user, notice])).toEqual([user, notice])
    expect(unanswered([user])).toEqual([user])
    expect(unanswered([user, ai])).toEqual([])
  })
})
