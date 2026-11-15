import { beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "@/lib/api"
import { GUEST_STORAGE_KEY, readGuestSnapshot } from "@/lib/repositories/guest-storage"
import { useChatStore } from "@/stores/chat-store"
import type { Trip } from "@/types/chat"
import type { Place } from "@/types/place"

const lisbon: Place = { id: "place.lisbon", city: "Lisbon", country: "Portugal", countryCode: "pt", longitude: -9.14, latitude: 38.72, bbox: null }
const details = { cityId: "place.lisbon", start: "2026-12-01", end: "2026-12-02", hotel: "", prefs: "Tiles" }
const day = { date: "2026-12-01", places: [{ id: "poi.1", name: "Tile Museum", description: "", coordinates: { latitude: 38.72, longitude: -9.11 } }] }

function stored() {
  return JSON.parse(localStorage.getItem(GUEST_STORAGE_KEY) ?? "null") as { state: { trips: Trip[]; lang?: string; dark?: boolean } } | null
}

function activeTrip() {
  const { trips, activeId } = useChatStore.getState()
  const trip = trips.find((item) => item.id === activeId)
  if (!trip) throw new Error("No active trip")
  return trip
}

/** A trip with its destination set, as after submitting the trip form. */
function startTrip() {
  const store = useChatStore.getState()
  store.createTrip()
  const id = activeTrip().id
  useChatStore.getState().saveTrip(id, { place: lisbon, details })
  return id
}

function chatReply(overrides: Record<string, unknown> = {}) {
  return {
    message: "Olá!",
    details: { start: "2026-12-01", end: "2026-12-02", hotel: "", prefs: "Tiles" },
    plan: { start: "2026-12-01", end: "2026-12-02", days: [day] },
    hints: ["Add museums", "Find cafes", "Optimize route"],
    conversationContext: { activeTopic: "Plan", pendingQuestion: null, discussedOptions: [], unresolvedReferences: [] },
    ...overrides,
  }
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  vi.restoreAllMocks()
  useChatStore.getState().enterGuest()
})

describe("guest mode storage", () => {
  it("creates a trip without an account and keeps it in localStorage", () => {
    const post = vi.spyOn(api, "post")
    const id = startTrip()

    expect(stored()?.state.trips.map((trip) => trip.id)).toEqual([id])
    expect(stored()?.state.trips[0]?.place?.city).toBe("Lisbon")
    // Nothing was sent to the trips API: guest trips never need PostgreSQL.
    expect(post).not.toHaveBeenCalled()
  })

  it("restores trips and messages after a reload", () => {
    const id = startTrip()
    useChatStore.getState().sendMessage(id, "Add a market")

    // A reload: the in-memory state is gone and the store is rebuilt from localStorage.
    useChatStore.setState({ hasHydrated: false, trips: [], activeId: null })
    useChatStore.getState().enterGuest()

    const trip = activeTrip()
    expect(trip.id).toBe(id)
    expect(trip.messages?.map((message) => [message.role, message.text])).toEqual([["user", "Add a market"]])
  })

  it("keeps language and theme the guest chose", () => {
    useChatStore.getState().setLang("ru")
    useChatStore.getState().setDark(true)
    expect(stored()?.state).toMatchObject({ lang: "ru", dark: true })

    useChatStore.getState().enterGuest()
    expect(useChatStore.getState()).toMatchObject({ lang: "ru", dark: true, langChosen: true, darkChosen: true })
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("records a settings change as a structured notice without a model instruction", () => {
    const id = startTrip()
    useChatStore.getState().saveTrip(id, { place: lisbon, details: { ...details, hotel: "Baixa" } })
    const notice = activeTrip().messages?.at(-1)
    expect(notice).toMatchObject({ role: "system", text: "", update: { hotel: "Baixa" } })
  })

  it("reads data written before accounts existed, including the legacy key", () => {
    localStorage.setItem(
      "city-explorer-chats",
      JSON.stringify({ state: { chats: [{ id: "legacy", name: "Old", ...details, place: lisbon, messages: [], tripDays: [day] }], activeId: "legacy" }, version: 0 }),
    )
    useChatStore.getState().enterGuest()
    expect(activeTrip()).toMatchObject({ id: "legacy", name: "Old", plans: [expect.objectContaining({ days: [day] })] })
  })
})

describe("guest chat", () => {
  it("sends trip data and new messages to /api/chat, never a system prompt, and stores the reply locally", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: chatReply() })
    const id = startTrip()

    useChatStore.getState().requestReply(id)
    await settle()

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body] = post.mock.calls[0] ?? []
    expect(url).toBe("/api/chat")
    expect(body).toEqual({
      language: "en",
      trip: {
        destination: { city: "Lisbon", country: "Portugal", latitude: 38.72, longitude: -9.14 },
        details: { start: "2026-12-01", end: "2026-12-02", hotel: "", prefs: "Tiles" },
        plan: null,
        conversationContext: null,
        initial: true,
      },
      turns: [],
    })
    expect(JSON.stringify(body)).not.toMatch(/YOUR ROLE|role":"system/)

    const trip = activeTrip()
    expect(trip.messages?.map((message) => [message.role, message.text])).toEqual([["ai", "Olá!"]])
    expect(trip.plans).toHaveLength(1)
    expect(trip.hints).toEqual(["Add museums", "Find cafes", "Optimize route"])
    expect(stored()?.state.trips[0]?.messages).toHaveLength(1)
  })

  it("sends only what the model has not answered, with the current plan and context", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: chatReply() })
    const id = startTrip()
    useChatStore.getState().requestReply(id)
    await settle()

    useChatStore.getState().saveTrip(id, { place: lisbon, details: { ...details, prefs: "Food" } })
    useChatStore.getState().sendMessage(id, "And cafes?")
    post.mockResolvedValue({ data: chatReply({ message: "Cafes added.", plan: null }) })
    useChatStore.getState().requestReply(id)
    await settle()

    const body = post.mock.calls[1]?.[1] as { trip: { initial: boolean; plan: unknown; conversationContext: unknown }; turns: unknown[] }
    expect(body.trip.initial).toBe(false)
    expect(body.trip.plan).toEqual({ days: [day] })
    expect(body.trip.conversationContext).toMatchObject({ activeTopic: "Plan" })
    expect(body.turns).toEqual([
      { type: "settings", update: { prefs: "Food" } },
      { type: "user", text: "And cafes?" },
    ])
    // No new plan version when the server reports the itinerary unchanged.
    expect(activeTrip().plans).toHaveLength(1)
  })

  it("keeps the user's message and offers a retry when the request fails", async () => {
    vi.spyOn(api, "post").mockRejectedValue(new Error("Network Error"))
    const id = startTrip()
    useChatStore.getState().sendMessage(id, "Hello?")
    useChatStore.getState().requestReply(id)
    await settle()

    expect(useChatStore.getState().failedItineraryIds).toEqual([id])
    expect(activeTrip().messages?.map((message) => message.text)).toEqual(["Hello?"])
    expect(stored()?.state.trips[0]?.messages).toHaveLength(1)
  })

  it("ignores a reply that arrives after the settings changed", async () => {
    let resolve: (value: { data: unknown }) => void = () => {}
    vi.spyOn(api, "post").mockReturnValue(new Promise((done) => (resolve = done)))
    const id = startTrip()
    useChatStore.getState().requestReply(id)
    useChatStore.getState().saveTrip(id, { place: lisbon, details: { ...details, hotel: "Alfama" } })
    resolve({ data: chatReply({ message: "Stale" }) })
    await settle()
    expect(activeTrip().messages?.some((message) => message.text === "Stale")).toBe(false)
  })
})

describe("account mode", () => {
  it("never writes account trips into guest storage", () => {
    startTrip()
    const guestData = localStorage.getItem(GUEST_STORAGE_KEY)

    const accountTrip: Trip = { ...activeTrip(), id: "account-trip", name: "Account trip", updatedAt: "2026-11-15T10:00:00.000Z" }
    useChatStore.getState().enterAccount({ language: "ru", theme: "dark" }, [accountTrip])
    vi.spyOn(api, "patch").mockResolvedValue({ data: { language: "en", theme: "dark" } })
    useChatStore.getState().setLang("en")

    expect(localStorage.getItem(GUEST_STORAGE_KEY)).toBe(guestData)
    expect(readGuestSnapshot().trips.map((trip) => trip.id)).not.toContain("account-trip")
  })

  it("saves language and theme to the account", async () => {
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ data: { language: "en", theme: "light" } })
    useChatStore.getState().enterAccount({ language: "ru", theme: "dark" }, [])
    useChatStore.getState().setDark(false)
    await settle()
    expect(patch).toHaveBeenCalledWith("/api/account/settings", { language: "ru", theme: "light" })
  })
})
