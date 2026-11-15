import { AxiosError, AxiosHeaders } from "axios"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "@/lib/api"
import { GUEST_STORAGE_KEY } from "@/lib/repositories/guest-storage"
import { setUnauthorizedHandler, useChatStore } from "@/stores/chat-store"
import type { Trip } from "@/types/chat"
import type { Place } from "@/types/place"

// Account mode: every change is shown at once and then sent to the API; the server's copy of the
// trip replaces the local one. These tests cover what happens when the two disagree.

const lisbon: Place = { id: "place.lisbon", city: "Lisbon", country: "Portugal", countryCode: "pt", longitude: -9.14, latitude: 38.72, bbox: null }
const details = { cityId: "place.lisbon", start: "2026-12-01", end: "2026-12-02", hotel: "", prefs: "Tiles" }

function serverTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "",
    details,
    place: lisbon,
    messages: [{ id: "a1", role: "ai", text: "Olá!" }],
    hints: [],
    plans: [],
    conversationContext: null,
    version: 3,
    updatedAt: "2026-11-15T10:00:00.000Z",
    ...overrides,
  }
}

function httpError(status: number, code: string) {
  const headers = new AxiosHeaders()
  return new AxiosError("Request failed", String(status), undefined, undefined, {
    status,
    statusText: "",
    headers,
    config: { headers },
    data: { error: code, code },
  })
}

function trip(id: string) {
  const found = useChatStore.getState().trips.find((item) => item.id === id)
  if (!found) throw new Error("Trip not found")
  return found
}

async function settle() {
  for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

function signIn(trips: Trip[] = [serverTrip()]) {
  useChatStore.getState().enterAccount({ language: "en", theme: "light" }, trips)
  return trips[0]?.id ?? ""
}

beforeEach(() => {
  vi.restoreAllMocks()
  setUnauthorizedHandler(() => {})
})

describe("saving to the account", () => {
  it("creates the trip with its client id, then saves the destination after it", async () => {
    const calls: string[] = []
    vi.spyOn(api, "post").mockImplementation(async (url, body) => {
      calls.push(`POST ${url}`)
      const { id } = body as { id: string }
      return { data: serverTrip({ id, place: null, messages: null, details: { ...details, cityId: null, start: null, end: null, prefs: "" }, version: 1 }) }
    })
    vi.spyOn(api, "patch").mockImplementation(async (url, body) => {
      calls.push(`PATCH ${url}`)
      expect(body).toEqual({ place: lisbon, details: { start: "2026-12-01", end: "2026-12-02", hotel: "", prefs: "Tiles" } })
      return { data: serverTrip({ id: String(url).split("/").at(-1), messages: [], version: 2, updatedAt: "2026-11-15T10:00:01.000Z" }) }
    })
    signIn([])

    useChatStore.getState().createTrip()
    const id = useChatStore.getState().activeId ?? ""
    useChatStore.getState().saveTrip(id, { place: lisbon, details })
    await settle()

    expect(calls).toEqual(["POST /api/trips", `PATCH /api/trips/${id}`])
    expect(trip(id)).toMatchObject({ version: 2, place: lisbon, messages: [] })
    expect(localStorage.getItem(GUEST_STORAGE_KEY)).toBeNull()
  })

  it("keeps a change on screen when saving fails and sends it again on retry", async () => {
    const patch = vi.spyOn(api, "patch").mockRejectedValueOnce(new AxiosError("Network Error", "ERR_NETWORK"))
    const id = signIn()

    useChatStore.getState().renameTrip(id, "Winter in Lisbon")
    await settle()
    expect(trip(id).name).toBe("Winter in Lisbon")
    expect(useChatStore.getState().syncError).toEqual({ offline: true })

    patch.mockResolvedValue({ data: serverTrip({ name: "Winter in Lisbon", updatedAt: "2026-11-15T10:00:05.000Z" }) })
    useChatStore.getState().retrySync()
    await settle()

    expect(patch).toHaveBeenCalledTimes(2)
    expect(patch.mock.calls[1]?.slice(0, 2)).toEqual([`/api/trips/${id}`, { name: "Winter in Lisbon" }])
    expect(useChatStore.getState().syncError).toBeNull()
  })

  it("does not let an older response overwrite a newer copy of the trip", async () => {
    vi.spyOn(api, "patch").mockResolvedValue({ data: serverTrip({ name: "Stale name", updatedAt: "2026-11-15T09:00:00.000Z" }) })
    const id = signIn([serverTrip({ name: "Current", updatedAt: "2026-11-15T10:00:00.000Z" })])

    useChatStore.getState().renameTrip(id, "Newest")
    await settle()

    expect(trip(id).name).toBe("Newest")
  })

  it("reports an ended session and keeps the unsaved change for after signing in again", async () => {
    const expired = vi.fn()
    setUnauthorizedHandler(expired)
    vi.spyOn(api, "patch").mockRejectedValue(httpError(401, "unauthorized"))
    const id = signIn()

    useChatStore.getState().renameTrip(id, "Winter in Lisbon")
    await settle()

    expect(expired).toHaveBeenCalledTimes(1)
    expect(trip(id).name).toBe("Winter in Lisbon")
    expect(useChatStore.getState().syncError).toEqual({ offline: false })
  })
})

describe("replies in the account", () => {
  it("sends unanswered messages with their ids and shows the server's trip", async () => {
    const answered = serverTrip({
      messages: [
        { id: "a1", role: "ai", text: "Olá!" },
        { id: "u1", role: "user", text: "More food" },
        { id: "a2", role: "ai", text: "Added a market." },
      ],
      hints: ["Find cafes"],
      version: 5,
      updatedAt: "2026-11-15T10:01:00.000Z",
    })
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: answered })
    const id = signIn()

    useChatStore.getState().sendMessage(id, "More food")
    const sent = trip(id).messages?.at(-1)
    useChatStore.getState().requestReply(id)
    expect(useChatStore.getState().pendingItineraryIds).toEqual([id])
    await settle()

    expect(post.mock.calls[0]?.slice(0, 2)).toEqual([`/api/trips/${id}/messages`, { messages: [{ id: sent?.id, text: "More food" }] }])
    expect(trip(id).messages?.map((message) => message.text)).toEqual(["Olá!", "More food", "Added a market."])
    expect(trip(id).hints).toEqual(["Find cafes"])
    expect(useChatStore.getState().pendingItineraryIds).toEqual([])
  })

  it("asks for the pending reply without resending anything when no message is waiting", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: serverTrip({ updatedAt: "2026-11-15T10:01:00.000Z" }) })
    const id = signIn([serverTrip({ messages: [] })])

    useChatStore.getState().requestReply(id)
    await settle()

    expect(post.mock.calls[0]?.[0]).toBe(`/api/trips/${id}/reply`)
    expect(trip(id).messages).toHaveLength(1)
  })

  it("does not ask twice while a reply is on its way", async () => {
    let finish: (value: { data: Trip }) => void = () => {}
    const post = vi.spyOn(api, "post").mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const id = signIn([serverTrip({ messages: [] })])

    useChatStore.getState().requestReply(id)
    useChatStore.getState().requestReply(id)
    await settle()
    expect(post).toHaveBeenCalledTimes(1)

    finish({ data: serverTrip({ updatedAt: "2026-11-15T10:01:00.000Z" }) })
    await settle()
    expect(trip(id).messages).toHaveLength(1)
  })

  it("takes the stored trip when it changed elsewhere while the model was answering", async () => {
    const elsewhere = serverTrip({
      details: { ...details, hotel: "Alfama" },
      messages: [
        { id: "a1", role: "ai", text: "Olá!" },
        { id: "s1", role: "system", text: "", update: { hotel: "Alfama" } },
        { id: "a2", role: "ai", text: "Noted the new hotel." },
      ],
      version: 6,
      updatedAt: "2026-11-15T10:02:00.000Z",
    })
    vi.spyOn(api, "post").mockRejectedValue(httpError(409, "trip_changed"))
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: elsewhere })
    const id = signIn([serverTrip({ messages: [] })])

    useChatStore.getState().requestReply(id)
    await settle()

    expect(get).toHaveBeenCalledWith(`/api/trips/${id}`)
    expect(trip(id).details.hotel).toBe("Alfama")
    expect(trip(id).messages).toHaveLength(3)
    expect(useChatStore.getState().failedItineraryIds).toEqual([])
  })

  it("keeps the message and offers a retry when the model is unavailable or the limit is reached", async () => {
    vi.spyOn(api, "post").mockRejectedValue(httpError(429, "rate_limited"))
    const id = signIn()

    useChatStore.getState().sendMessage(id, "More food")
    useChatStore.getState().requestReply(id)
    await settle()

    expect(useChatStore.getState().failedItineraryIds).toEqual([id])
    expect(trip(id).messages?.at(-1)).toMatchObject({ role: "user", text: "More food" })
  })

  it("drops a reply that belongs to the previous session", async () => {
    let finish: (value: { data: Trip }) => void = () => {}
    vi.spyOn(api, "post").mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const id = signIn([serverTrip({ messages: [] })])

    useChatStore.getState().requestReply(id)
    useChatStore.getState().enterGuest()
    finish({ data: serverTrip({ updatedAt: "2026-11-15T10:01:00.000Z" }) })
    await settle()

    expect(useChatStore.getState().trips.some((item) => item.id === id)).toBe(false)
    expect(localStorage.getItem(GUEST_STORAGE_KEY)).toBeNull()
  })
})
