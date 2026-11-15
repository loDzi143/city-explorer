import { AxiosError, AxiosHeaders } from "axios"
import { beforeEach, describe, expect, it, vi } from "vitest"

import * as authClient from "@/lib/auth-client"
import * as accountTrips from "@/lib/repositories/account-trip-repository"
import { GUEST_STORAGE_KEY, readGuestSnapshot, rememberAccountSession, writeGuestSnapshot } from "@/lib/repositories/guest-storage"
import { useChatStore } from "@/stores/chat-store"
import { toGuestTripPayload, useSessionStore } from "@/stores/session-store"
import type { Account } from "@/types/account"
import type { Trip } from "@/types/chat"

vi.mock("@/lib/auth-client", () => ({
  fetchAccount: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  saveAccountSettings: vi.fn(),
  importGuestTrips: vi.fn(),
}))

vi.mock("@/lib/repositories/account-trip-repository", () => ({
  fetchAccountTrips: vi.fn(),
  createAccountTripRepository: () => ({}),
}))

const auth = vi.mocked(authClient)
const fetchAccountTrips = vi.mocked(accountTrips.fetchAccountTrips)

const account: Account = { user: { id: "user-1", username: "traveller" }, settings: { language: "ru", theme: "dark" } }

const guestTrip: Trip = {
  id: "guest-1",
  name: "Lisbon",
  details: { cityId: "place.lisbon", start: "2026-12-01", end: "2026-12-02", hotel: "", prefs: "" },
  place: { id: "place.lisbon", city: "Lisbon", country: "Portugal", countryCode: "pt", longitude: -9.14, latitude: 38.72, bbox: null },
  messages: [
    { id: "m1", role: "ai", text: "Olá" },
    { id: "m2", role: "system", text: "The user has updated their trip settings:\n- Accommodation: Baixa\nUse the updated details" },
    { id: "m3", role: "user", text: "More food" },
  ],
  hints: [],
  plans: [],
  conversationContext: null,
}

const accountTrip: Trip = { ...guestTrip, id: "server-1", name: "From the account", messages: [], updatedAt: "2026-11-15T10:00:00.000Z" }

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

const networkError = () => new AxiosError("Network Error", "ERR_NETWORK")

function guestData() {
  return localStorage.getItem(GUEST_STORAGE_KEY)
}

async function startFresh() {
  // Module state survives between tests; reset both stores to a fresh page load.
  useSessionStore.setState({ status: "initializing", user: null, expired: false, importOffer: null, signingOut: false, signOutFailed: false })
  useChatStore.setState({ hasHydrated: false, mode: "guest", trips: [], activeId: null })
  await useSessionStore.getState().retry()
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.fetchAccount.mockRejectedValue(httpError(401, "unauthorized"))
  fetchAccountTrips.mockResolvedValue([accountTrip])
})

describe("startup", () => {
  it("starts as a guest when there is no session", async () => {
    writeGuestSnapshot({ trips: [guestTrip], activeId: guestTrip.id })
    await startFresh()
    expect(useSessionStore.getState().status).toBe("guest")
    expect(useChatStore.getState()).toMatchObject({ mode: "guest", hasHydrated: true })
    expect(useChatStore.getState().trips.map((trip) => trip.id)).toEqual(["guest-1"])
  })

  it("loads user, settings and trips for a signed-in user", async () => {
    auth.fetchAccount.mockResolvedValue(account)
    await startFresh()
    expect(useSessionStore.getState()).toMatchObject({ status: "account", user: account.user })
    expect(useChatStore.getState()).toMatchObject({ mode: "account", lang: "ru", dark: true })
    expect(useChatStore.getState().trips.map((trip) => trip.id)).toEqual(["server-1"])
  })

  it("stays a guest with local data when the server is down and there was no account", async () => {
    auth.fetchAccount.mockRejectedValue(networkError())
    writeGuestSnapshot({ trips: [guestTrip], activeId: guestTrip.id })
    await startFresh()
    expect(useSessionStore.getState().status).toBe("guest")
    expect(useChatStore.getState().trips).toHaveLength(1)
  })

  it("does not turn a signed-in user into a guest when the server is down", async () => {
    rememberAccountSession(true)
    auth.fetchAccount.mockRejectedValue(httpError(503, "service_unavailable"))
    writeGuestSnapshot({ trips: [guestTrip], activeId: guestTrip.id })
    const before = guestData()
    await startFresh()
    expect(useSessionStore.getState().status).toBe("account-error")
    expect(useChatStore.getState().hasHydrated).toBe(false)
    expect(guestData()).toBe(before)
  })

  it("reports an expired session once and continues as a guest", async () => {
    rememberAccountSession(true)
    await startFresh()
    expect(useSessionStore.getState()).toMatchObject({ status: "guest", expired: true })
  })
})

describe("signing in with guest data", () => {
  beforeEach(async () => {
    writeGuestSnapshot({ trips: [guestTrip], activeId: guestTrip.id, lang: "en", dark: false })
    await startFresh()
    auth.login.mockResolvedValue(account)
  })

  it("offers to move guest trips before opening the account", async () => {
    const result = await useSessionStore.getState().login({ username: "traveller", password: "secret pass" })
    expect(result).toEqual({ ok: true })
    expect(useSessionStore.getState().importOffer).toMatchObject({ tripCount: 1, importing: false, failed: false })
    expect(useChatStore.getState().mode).toBe("guest")
  })

  it("moves the trips, then removes them from the browser and opens the account", async () => {
    auth.importGuestTrips.mockResolvedValue({ imported: 1, skipped: 0, trips: [] })
    await useSessionStore.getState().login({ username: "traveller", password: "secret pass" })
    await useSessionStore.getState().importGuestData()

    const [payload] = auth.importGuestTrips.mock.calls[0] ?? []
    expect(payload).toEqual([toGuestTripPayload(guestTrip)])
    // The legacy instruction text became a structured update; the model instruction is not sent.
    expect(payload?.[0]?.messages).toEqual([
      { role: "ai", text: "Olá" },
      { role: "system", update: { hotel: "Baixa" } },
      { role: "user", text: "More food" },
    ])
    expect(readGuestSnapshot()).toMatchObject({ trips: [], lang: "en", dark: false })
    expect(useSessionStore.getState().status).toBe("account")
    expect(useChatStore.getState().trips.map((trip) => trip.id)).toEqual(["server-1"])
  })

  it("keeps local data when the move fails, and allows skipping it", async () => {
    auth.importGuestTrips.mockRejectedValue(httpError(500, "import_failed"))
    await useSessionStore.getState().login({ username: "traveller", password: "secret pass" })
    const before = guestData()
    await useSessionStore.getState().importGuestData()

    expect(useSessionStore.getState().importOffer).toMatchObject({ failed: true, importing: false })
    expect(guestData()).toBe(before)

    await useSessionStore.getState().skipImport()
    expect(useSessionStore.getState().status).toBe("account")
    expect(guestData()).toBe(before)
  })

  it("brings back the untouched guest data after signing out", async () => {
    auth.logout.mockResolvedValue()
    await useSessionStore.getState().login({ username: "traveller", password: "secret pass" })
    await useSessionStore.getState().skipImport()
    const before = guestData()

    await useSessionStore.getState().logout()

    expect(useSessionStore.getState().status).toBe("guest")
    expect(guestData()).toBe(before)
    expect(useChatStore.getState()).toMatchObject({ mode: "guest", lang: "en", dark: false })
    expect(useChatStore.getState().trips.map((trip) => trip.id)).toEqual(["guest-1"])
  })

  it("stays signed in when signing out fails for lack of connection", async () => {
    auth.logout.mockRejectedValue(networkError())
    await useSessionStore.getState().login({ username: "traveller", password: "secret pass" })
    await useSessionStore.getState().skipImport()
    await useSessionStore.getState().logout()
    expect(useSessionStore.getState()).toMatchObject({ status: "account", signOutFailed: true })
  })

  it("registers with the guest's language and theme", async () => {
    auth.register.mockResolvedValue(account)
    await useSessionStore.getState().register({ username: "newbie", password: "secret pass" })
    expect(auth.register).toHaveBeenCalledWith({ username: "newbie", password: "secret pass" }, { language: "en", theme: "light" })
  })

  it("maps server errors to reasons the form can show", async () => {
    auth.login.mockRejectedValue(httpError(401, "invalid_credentials"))
    expect(await useSessionStore.getState().login({ username: "x", password: "y" })).toMatchObject({ ok: false, reason: "invalid_credentials" })
    auth.register.mockRejectedValue(httpError(409, "username_taken"))
    expect(await useSessionStore.getState().register({ username: "x", password: "y" })).toMatchObject({ ok: false, reason: "username_taken" })
    auth.login.mockRejectedValue(networkError())
    expect(await useSessionStore.getState().login({ username: "x", password: "y" })).toMatchObject({ ok: false, reason: "network" })
  })
})
