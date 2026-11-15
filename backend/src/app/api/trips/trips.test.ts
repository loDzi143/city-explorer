import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { createBrowser, uuid } from "@/app/api/_lib/testing"
import { POST as importGuestData } from "@/app/api/account/import-guest-data/route"
import { PATCH as patchSettings } from "@/app/api/account/settings/route"
import { POST as register } from "@/app/api/auth/register/route"
import { GET as listMessages, POST as sendMessages } from "@/app/api/trips/[id]/messages/route"
import { POST as reply } from "@/app/api/trips/[id]/reply/route"
import { DELETE as deleteTrip, GET as getTrip, PATCH as patchTrip } from "@/app/api/trips/[id]/route"
import { GET as listTrips, POST as createTrip } from "@/app/api/trips/route"
import { schema } from "@/infrastructure/database/client"
import { createTestDatabase } from "@/infrastructure/database/testing"
import { fakeChat } from "@/modules/ai/llm/providers/fake.provider"
import type { Trip } from "@/modules/trips/trips.types"

vi.mock("@/modules/ai/llm/providers/openrouter.provider", async () => ({
  openRouterProvider: (await import("@/modules/ai/llm/providers/fake.provider")).fakeChat.provider,
}))

type ApiError = { error: string; code: string }

const seoul = {
  id: "place.seoul",
  city: "Seoul",
  country: "South Korea",
  countryCode: "kr",
  longitude: 126.9779,
  latitude: 37.5665,
  bbox: [126.76, 37.41, 127.18, 37.7] as [number, number, number, number],
}

const details = { start: "2026-12-01", end: "2026-12-02", hotel: "Lotte Hotel", prefs: "Palaces and food" }

const palace = { id: "poi.1", name: "Gyeongbokgung", description: "Palace", coordinates: { latitude: 37.58, longitude: 126.98 } }
const market = { id: "poi.2", name: "Gwangjang Market", description: "Food", coordinates: { latitude: 37.57, longitude: 127.0 } }

function agentReply(overrides: Record<string, unknown> = {}) {
  return {
    message: "Welcome to Seoul!",
    days: [
      { date: "2026-12-01", places: [palace] },
      { date: "2026-12-02", places: [market] },
    ],
    hints: ["Add museums", "Find cafes", "Optimize route"],
    conversationContext: { activeTopic: "First itinerary", pendingQuestion: null, discussedOptions: [], unresolvedReferences: [] },
    ...overrides,
  }
}

let database: Awaited<ReturnType<typeof createTestDatabase>>

beforeAll(async () => {
  database = await createTestDatabase()
})

afterAll(async () => {
  await database.close()
})

beforeEach(async () => {
  await database.reset()
  fakeChat.reset()
})

async function signedIn(username = `user${Math.floor(Math.random() * 1e9)}`) {
  const browser = createBrowser()
  const result = await browser.call(register, { body: { username, password: "correct horse 1" } })
  expect(result.status).toBe(201)
  return browser
}

type Browser = Awaited<ReturnType<typeof signedIn>>

/** A trip with a destination and its first itinerary, like after submitting the trip form. */
async function startedTrip(browser: Browser) {
  const created = await browser.call<Trip>(createTrip, { body: { id: uuid() } })
  const id = created.body.id
  await browser.call(patchTrip, { method: "PATCH", params: { id }, body: { place: seoul, details } })
  fakeChat.replyWith(agentReply())
  const first = await browser.call<Trip>(reply, { method: "POST", params: { id } })
  expect(first.status).toBe(200)
  return first.body
}

describe("trip CRUD", () => {
  it("creates, lists, reads, updates and deletes a trip", async () => {
    const browser = await signedIn()
    const id = uuid()

    const created = await browser.call<Trip>(createTrip, { body: { id } })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ id, name: "", place: null, messages: null, plans: [], version: 1 })

    // Retrying the same create returns the same trip instead of a second one.
    const retried = await browser.call<Trip>(createTrip, { body: { id } })
    expect(retried.status).toBe(200)

    const setUp = await browser.call<Trip>(patchTrip, { method: "PATCH", params: { id }, body: { place: seoul, details } })
    expect(setUp.status).toBe(200)
    expect(setUp.body.place).toEqual(seoul)
    expect(setUp.body.details).toEqual({ cityId: "place.seoul", ...details })
    expect(setUp.body.messages).toEqual([])

    const renamed = await browser.call<Trip>(patchTrip, { method: "PATCH", params: { id }, body: { name: "  Winter in Seoul " } })
    expect(renamed.body.name).toBe("Winter in Seoul")

    const list = await browser.call<Trip[]>(listTrips)
    expect(list.body.map((trip) => trip.id)).toEqual([id])
    expect((await browser.call<Trip>(getTrip, { params: { id } })).body.name).toBe("Winter in Seoul")

    expect((await browser.call(deleteTrip, { method: "DELETE", params: { id } })).status).toBe(204)
    expect((await browser.call(getTrip, { params: { id } })).status).toBe(404)
    expect(await database.db.select().from(schema.trips)).toHaveLength(0)
  })

  it("lists trips newest first", async () => {
    const browser = await signedIn()
    const first = (await browser.call<Trip>(createTrip, { body: {} })).body.id
    const second = (await browser.call<Trip>(createTrip, { body: {} })).body.id
    const list = await browser.call<Trip[]>(listTrips)
    expect(list.body.map((trip) => trip.id)).toEqual([second, first])
  })

  it("validates input", async () => {
    const browser = await signedIn()
    const id = (await browser.call<Trip>(createTrip, { body: {} })).body.id
    const bad = [
      { place: { ...seoul, latitude: 200 }, details },
      { place: seoul, details: { ...details, start: "2026-12-05" } },
      { place: seoul, details: { ...details, start: "2026-02-30" } },
      { place: seoul, details: { ...details, hotel: "x".repeat(2000) } },
      { place: seoul, details: { start: null, end: null, hotel: "", prefs: "" } },
      {},
    ]
    for (const body of bad) {
      expect((await browser.call(patchTrip, { method: "PATCH", params: { id }, body })).status).toBe(400)
    }
    expect((await browser.call(getTrip, { params: { id: "not-a-uuid" } })).status).toBe(404)
  })

  it("keeps the destination fixed once set", async () => {
    const browser = await signedIn()
    const trip = await startedTrip(browser)
    const result = await browser.call<ApiError>(patchTrip, {
      method: "PATCH",
      params: { id: trip.id },
      body: { place: { ...seoul, id: "place.busan", city: "Busan" }, details },
    })
    expect(result.status).toBe(400)
    expect(result.body.code).toBe("destination_locked")
  })

  it("requires a session", async () => {
    expect((await createBrowser().call(listTrips)).status).toBe(401)
    expect((await createBrowser().call(createTrip, { body: {} })).status).toBe(401)
  })
})

describe("messages and plans", () => {
  it("creates the first itinerary and stores it as the current plan", async () => {
    const browser = await signedIn()
    const trip = await startedTrip(browser)

    expect(trip.messages).toEqual([expect.objectContaining({ role: "ai", text: "Welcome to Seoul!" })])
    expect(trip.plans).toHaveLength(1)
    expect(trip.plans[0]).toMatchObject({ start: "2026-12-01", end: "2026-12-02", days: agentReply().days })
    expect(trip.hints).toEqual(["Add museums", "Find cafes", "Optimize route"])
    expect(trip.conversationContext?.activeTopic).toBe("First itinerary")
  })

  it("saves the user message and the reply, and returns the history", async () => {
    const browser = await signedIn()
    const trip = await startedTrip(browser)
    const messageId = uuid()

    fakeChat.replyWith(agentReply({ message: "Added a market.", days: [{ date: "2026-12-01", places: [palace, market] }, { date: "2026-12-02", places: [] }] }))
    const result = await browser.call<Trip>(sendMessages, {
      params: { id: trip.id },
      body: { messages: [{ id: messageId, text: "Add a food market on day one" }] },
    })
    expect(result.status).toBe(200)
    expect(result.body.messages?.map((message) => [message.role, message.text])).toEqual([
      ["ai", "Welcome to Seoul!"],
      ["user", "Add a food market on day one"],
      ["ai", "Added a market."],
    ])
    expect(result.body.messages?.[1]?.id).toBe(messageId)
    expect(result.body.plans).toHaveLength(2)
    expect(result.body.plans[1]?.days[0]?.places.map((place) => place.id)).toEqual(["poi.1", "poi.2"])

    const history = await browser.call<Trip["messages"]>(listMessages, { params: { id: trip.id } })
    expect(history.body).toEqual(result.body.messages)
  })

  it("does not add a plan version when the itinerary is unchanged", async () => {
    const browser = await signedIn()
    const trip = await startedTrip(browser)
    fakeChat.replyWith(agentReply({ message: "Seoul is cold in December." }))
    const result = await browser.call<Trip>(sendMessages, { params: { id: trip.id }, body: { messages: [{ id: uuid(), text: "Is it cold?" }] } })
    expect(result.body.plans).toHaveLength(1)
  })

  it("keeps the message when the model fails and replies on retry without duplicating it", async () => {
    const browser = await signedIn()
    const trip = await startedTrip(browser)
    const message = { id: uuid(), text: "Add a museum" }

    fakeChat.push(new Error("network down"))
    const failed = await browser.call<ApiError>(sendMessages, { params: { id: trip.id }, body: { messages: [message] } })
    expect(failed.status).toBe(502)
    expect(failed.body.code).toBe("llm_unavailable")
    const stored = await browser.call<Trip["messages"]>(listMessages, { params: { id: trip.id } })
    expect(stored.body?.at(-1)).toMatchObject({ id: message.id, role: "user" })

    fakeChat.replyWith(agentReply({ message: "Museum added." }))
    const retried = await browser.call<Trip>(sendMessages, { params: { id: trip.id }, body: { messages: [message] } })
    expect(retried.status).toBe(200)
    expect(retried.body.messages?.filter((item) => item.id === message.id)).toHaveLength(1)
    expect(retried.body.messages?.at(-1)?.text).toBe("Museum added.")

    // The same request once more: already answered, so no model call and no new messages.
    const again = await browser.call<Trip>(sendMessages, { params: { id: trip.id }, body: { messages: [message] } })
    expect(again.body.messages).toHaveLength(retried.body.messages?.length ?? 0)
    expect(fakeChat.requests).toHaveLength(3)
  })

  it("discards a reply when the trip changed while it was generated", async () => {
    const browser = await signedIn()
    const trip = await startedTrip(browser)

    fakeChat.push(async () => {
      // The user edits the trip settings while the model is still answering.
      await browser.call(patchTrip, { method: "PATCH", params: { id: trip.id }, body: { details: { ...details, hotel: "Four Seasons" } } })
      return { content: JSON.stringify(agentReply({ message: "Stale" })), toolCalls: [] }
    })
    const result = await browser.call<ApiError>(sendMessages, { params: { id: trip.id }, body: { messages: [{ id: uuid(), text: "Hi" }] } })
    expect(result.status).toBe(409)
    expect(result.body.code).toBe("trip_changed")

    const current = await browser.call<Trip>(getTrip, { params: { id: trip.id } })
    expect(current.body.messages?.some((message) => message.text === "Stale")).toBe(false)
    expect(current.body.details.hotel).toBe("Four Seasons")
  })

  it("records a settings change as a system message and applies settings changed in the conversation", async () => {
    const browser = await signedIn()
    const trip = await startedTrip(browser)

    const updated = await browser.call<Trip>(patchTrip, {
      method: "PATCH",
      params: { id: trip.id },
      body: { details: { ...details, end: "2026-12-03", prefs: "Museums" } },
    })
    expect(updated.body.messages?.at(-1)).toMatchObject({
      role: "system",
      text: "",
      update: { dates: { start: "2026-12-01", end: "2026-12-03" }, prefs: "Museums" },
    })

    // Saving the same values again is not a change.
    const same = await browser.call<Trip>(patchTrip, { method: "PATCH", params: { id: trip.id }, body: { details: { ...details, end: "2026-12-03", prefs: "Museums" } } })
    expect(same.body.messages).toHaveLength(updated.body.messages?.length ?? 0)

    fakeChat.replyWith(agentReply({ message: "Extended.", settings: { hotel: "Hanok stay" } }))
    const replied = await browser.call<Trip>(reply, { method: "POST", params: { id: trip.id } })
    expect(replied.body.details).toMatchObject({ end: "2026-12-03", prefs: "Museums", hotel: "Hanok stay" })
  })
})

describe("reply budget", () => {
  it("limits how many replies one account can request without affecting other accounts", async () => {
    const browser = await signedIn()
    const trip = await startedTrip(browser)
    // The trip is already answered, so these requests cost nothing but still count: startedTrip used one.
    for (let request = 0; request < 59; request += 1) {
      expect((await browser.call(reply, { method: "POST", params: { id: trip.id } })).status).toBe(200)
    }

    const limited = await browser.call<ApiError>(reply, { method: "POST", params: { id: trip.id } })
    expect(limited.status).toBe(429)
    expect(limited.body.code).toBe("rate_limited")
    const sent = await browser.call(sendMessages, { params: { id: trip.id }, body: { messages: [{ id: uuid(), text: "One more" }] } })
    expect(sent.status).toBe(429)
    // A message refused by the limit is not stored: nothing is left half-done.
    expect((await browser.call<Trip>(getTrip, { params: { id: trip.id } })).body.messages).toHaveLength(1)

    await startedTrip(await signedIn())
  })
})

describe("isolation between users", () => {
  it("never exposes or changes another user's trip, even by id", async () => {
    const alice = await signedIn("alice")
    const bob = await signedIn("bob")
    const trip = await startedTrip(alice)
    const params = { id: trip.id }

    expect((await bob.call(listTrips)).body).toEqual([])
    expect((await bob.call<ApiError>(getTrip, { params })).status).toBe(404)
    expect((await bob.call(patchTrip, { method: "PATCH", params, body: { name: "Mine now" } })).status).toBe(404)
    expect((await bob.call(deleteTrip, { method: "DELETE", params })).status).toBe(404)
    expect((await bob.call(listMessages, { params })).status).toBe(404)
    expect((await bob.call(sendMessages, { params, body: { messages: [{ id: uuid(), text: "Hi" }] } })).status).toBe(404)
    expect((await bob.call(reply, { method: "POST", params })).status).toBe(404)

    // Creating a trip with Alice's id must not take it over.
    const taken = await bob.call<ApiError>(createTrip, { body: { id: trip.id } })
    expect(taken.status).toBe(409)

    // Reusing the id of Alice's message in Bob's trip is refused.
    const bobTrip = await startedTrip(bob)
    const aliceMessage = (await alice.call<Trip>(getTrip, { params })).body.messages?.[0]?.id ?? ""
    expect((await bob.call(sendMessages, { params: { id: bobTrip.id }, body: { messages: [{ id: aliceMessage, text: "Hi" }] } })).status).toBe(409)

    const untouched = await alice.call<Trip>(getTrip, { params })
    expect(untouched.body.name).toBe("")
    expect(untouched.body.messages).toHaveLength(1)
  })
})

describe("prompt built on the server", () => {
  it("uses the stored trip settings, plan, context and account language", async () => {
    const browser = await signedIn()
    await browser.call(patchSettings, { method: "PATCH", body: { language: "ru" } })
    const trip = await startedTrip(browser)

    const initial = fakeChat.requests[0]?.messages[0]
    expect(initial?.role).toBe("system")
    expect(initial?.content).toContain("Destination: Seoul, South Korea")
    expect(initial?.content).toContain("Destination coordinates: 37.5665, 126.9779")
    expect(initial?.content).toContain("Trip dates: 2026-12-01 – 2026-12-02")
    expect(initial?.content).toContain("Accommodation: Lotte Hotel")
    expect(initial?.content).toContain("User preferences: Palaces and food")
    expect(initial?.content).toContain("Initial request: Yes")
    expect(initial?.content).toContain("No itinerary exists yet for this trip.")
    expect(initial?.content).toContain("Always write the message field in русский.")

    await browser.call(patchTrip, { method: "PATCH", params: { id: trip.id }, body: { details: { ...details, hotel: "Four Seasons" } } })
    fakeChat.replyWith(agentReply({ message: "Updated." }))
    await browser.call(reply, { method: "POST", params: { id: trip.id } })

    const [system, ...turns] = fakeChat.requests[1]?.messages ?? []
    expect(system?.content).toContain("Accommodation: Four Seasons")
    expect(system?.content).toContain("Initial request: No")
    expect(system?.content).toContain('"id":"poi.1"')
    expect(system?.content).toContain('"activeTopic": "First itinerary"')
    // Only the unanswered change is sent, as a server-written instruction; no chat history.
    expect(turns).toEqual([
      {
        role: "system",
        content: expect.stringMatching(/^The user has updated their trip settings:\n- Accommodation: Four Seasons\n/),
      },
    ])
  })
})

describe("guest data import", () => {
  const guestTrip = {
    id: "guest-trip-1",
    name: "Seoul with friends",
    place: seoul,
    details,
    messages: [
      { role: "ai", text: JSON.stringify(agentReply({ message: "Hello from the old format" })) },
      { role: "user", text: "Add a market" },
      { role: "system", update: { hotel: "Hanok stay" } },
      { role: "ai", text: "Done." },
    ],
    hints: ["Add museums"],
    plans: [
      { date: "2026-11-01T10:00:00.000Z", start: details.start, end: details.end, days: agentReply().days },
      { date: "2026-11-02T10:00:00.000Z", start: details.start, end: details.end, days: [{ date: "2026-12-01", places: [market] }] },
    ],
    conversationContext: { activeTopic: null, pendingQuestion: null, discussedOptions: ["A"], unresolvedReferences: [] },
  }
  const draft = {
    id: "guest-trip-2",
    name: "",
    place: null,
    details: { start: null, end: null, hotel: "", prefs: "" },
    messages: null,
    hints: [],
    plans: [],
    conversationContext: null,
  }

  it("imports trips with their messages and plans", async () => {
    const browser = await signedIn()
    const result = await browser.call<{ imported: number; skipped: number; trips: Trip[] }>(importGuestData, { body: { trips: [guestTrip, draft] } })

    expect(result.status).toBe(200)
    expect(result.body.imported).toBe(2)
    expect(result.body.trips).toHaveLength(2)
    const [imported, importedDraft] = result.body.trips
    expect(imported?.name).toBe("Seoul with friends")
    expect(imported?.messages?.map((message) => [message.role, message.text])).toEqual([
      ["ai", "Hello from the old format"],
      ["user", "Add a market"],
      ["system", ""],
      ["ai", "Done."],
    ])
    expect(imported?.messages?.[2]?.update).toEqual({ hotel: "Hanok stay" })
    expect(imported?.plans.map((plan) => plan.date)).toEqual(["2026-11-01T10:00:00.000Z", "2026-11-02T10:00:00.000Z"])
    expect(imported?.conversationContext?.discussedOptions).toEqual(["A"])
    expect(importedDraft?.messages).toBeNull()

    // Imported trips continue to work with the chat.
    fakeChat.replyWith(agentReply({ message: "Continuing." }))
    const continued = await browser.call<Trip>(sendMessages, { params: { id: imported?.id ?? "" }, body: { messages: [{ id: uuid(), text: "More food" }] } })
    expect(continued.status).toBe(200)
    expect(fakeChat.requests[0]?.messages[0]?.content).toContain("Initial request: No")
  })

  it("skips trips that were already imported", async () => {
    const browser = await signedIn()
    await browser.call(importGuestData, { body: { trips: [guestTrip] } })
    const again = await browser.call<{ imported: number; skipped: number; trips: Trip[] }>(importGuestData, { body: { trips: [guestTrip, draft] } })
    expect(again.body).toMatchObject({ imported: 1, skipped: 1 })
    expect(again.body.trips).toHaveLength(2)
    expect(await database.db.select().from(schema.tripMessages)).toHaveLength(4)
  })

  it("imports the same guest data into different accounts independently", async () => {
    const first = await signedIn()
    const second = await signedIn()
    await first.call(importGuestData, { body: { trips: [guestTrip] } })
    const result = await second.call<{ imported: number }>(importGuestData, { body: { trips: [guestTrip] } })
    expect(result.body.imported).toBe(1)
  })

  it("accepts what a model reply may contain, cutting overlong hints instead of refusing the import", async () => {
    const browser = await signedIn()
    const hints = [...Array.from({ length: 12 }, (_, index) => `Hint ${index}`), "h".repeat(500)]
    const result = await browser.call<{ imported: number; trips: Trip[] }>(importGuestData, { body: { trips: [{ ...guestTrip, hints }] } })

    expect(result.status).toBe(200)
    expect(result.body.trips[0]?.hints).toHaveLength(10)
  })

  it("stores nothing when the data is invalid", async () => {
    const browser = await signedIn()
    const broken = { ...draft, id: "guest-trip-3", details: { ...details, start: "not a date" } }
    const result = await browser.call(importGuestData, { body: { trips: [guestTrip, broken] } })
    expect(result.status).toBe(400)
    expect(await database.db.select().from(schema.trips)).toHaveLength(0)
  })
})
