import { create } from "zustand"

import { apiFailure, failureCode, isUnauthorized } from "@/lib/api"
import { saveAccountSettings } from "@/lib/auth-client"
import { createAccountTripRepository } from "@/lib/repositories/account-trip-repository"
import { readGuestSnapshot, writeGuestSnapshot, type GuestSnapshot } from "@/lib/repositories/guest-storage"
import { createGuestTripRepository } from "@/lib/repositories/guest-trip-repository"
import type { TripReducer, TripRepository } from "@/lib/repositories/trip-repository"
import type { AccountSettings, StorageMode } from "@/types/account"
import type { ChatMessage, Trip, TripPlan, TripSettings } from "@/types/chat"
import type { Lang } from "@/types/lang"
import { tripPlace } from "@/utils/place"
import { needsReply } from "@/utils/trip-messages"
import { tripUpdate } from "@/utils/trip-update"

/** A change that was applied on screen but couldn't be saved on the server. */
export type SyncError = {
  /** No connection, as opposed to the server refusing or failing. */
  offline: boolean
}

type ChatState = {
  /** The workspace has data to show: guest data is read or account data is loaded. */
  hasHydrated: boolean
  mode: StorageMode
  lang: Lang
  dark: boolean
  langChosen: boolean
  darkChosen: boolean
  trips: Trip[]
  activeId: string | null
  pendingItineraryIds: string[]
  failedItineraryIds: string[]
  syncError: SyncError | null
  enterGuest: () => void
  enterAccount: (settings: AccountSettings, trips: Trip[]) => void
  /** Hides the workspace while another mode's data is loading. */
  suspend: () => void
  setLang: (lang: Lang) => void
  setDark: (dark: boolean) => void
  followSystemLang: () => void
  followSystemDark: () => void
  createTrip: () => void
  selectTrip: (id: string) => void
  renameTrip: (id: string, name: string) => void
  deleteTrip: (id: string) => void
  saveTrip: (id: string, value: TripSettings) => void
  sendMessage: (id: string, text: string) => void
  /** Asks for the assistant reply when the trip has unanswered messages (or none yet). */
  requestReply: (id: string) => void
  retrySync: () => void
}

const guestRepository = createGuestTripRepository()
let repository: TripRepository = guestRepository

// Bumped on every mode switch: results of requests started in the previous mode are dropped.
let epoch = 0
const repliesInFlight = new Set<string>()
const replyTokens = new Map<string, number>()
let failedWrites: (() => void)[] = []
// True while guest data is being loaded into the store, so loading never writes it back.
let loadingGuestData = false
let onUnauthorized: () => void = () => {}

/** Called when the API reports that the session is gone (expired or revoked elsewhere). */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

function replyToken(id: string) {
  return replyTokens.get(id) ?? 0
}

function invalidateReply(id: string) {
  replyTokens.set(id, replyToken(id) + 1)
  repliesInFlight.delete(id)
}

function resetRequests() {
  epoch += 1
  repliesInFlight.clear()
  replyTokens.clear()
  failedWrites = []
}

function systemLang(): Lang {
  if (typeof navigator === "undefined") return "en"
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of tags) {
    const base = tag?.toLowerCase().split("-")[0]
    if (base === "ru" || base === "en") return base
  }
  return "en"
}

function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
}

function applyDocumentPreferences(lang: Lang, dark: boolean) {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.lang = lang
}

export function tripTitle(trip: Trip, t: { untitled: string }) {
  const custom = trip.name.trim()
  if (custom) return custom
  const place = tripPlace(trip)
  return place ? place.city : t.untitled
}

export function latestPlan(trip: Trip): TripPlan | null {
  return trip.plans.at(-1) ?? null
}

/** The guest data to store: language and theme only when the user picked them. */
function guestSnapshot(state: ChatState): GuestSnapshot {
  const snapshot: GuestSnapshot = { trips: state.trips, activeId: state.activeId }
  if (state.langChosen) snapshot.lang = state.lang
  if (state.darkChosen) snapshot.dark = state.dark
  return snapshot
}

export const useChatStore = create<ChatState>()((set, get) => {
  function updateTrip(id: string, reducer: TripReducer) {
    set((state) => ({ trips: state.trips.map((trip) => (trip.id === id ? reducer(trip) : trip)) }))
  }

  function failSync(error: unknown, retry: () => void) {
    if (isUnauthorized(error)) onUnauthorized()
    failedWrites.push(retry)
    set({ syncError: { offline: apiFailure(error).kind === "network" } })
  }

  /**
   * Saves a change that is already on screen. In guest mode the snapshot subscription below has
   * stored it; in account mode the request runs and the server's version of the trip is applied.
   */
  function persist(tripId: string | null, write: () => Promise<TripReducer | null | void>) {
    const started = epoch
    write()
      .then((reducer) => {
        if (started === epoch && reducer && tripId) updateTrip(tripId, reducer)
      })
      .catch((error: unknown) => {
        if (started === epoch) failSync(error, () => persist(tripId, write))
      })
  }

  function persistSettings() {
    if (repository.mode !== "account") return
    persist(null, async () => {
      const { lang, dark } = get()
      await saveAccountSettings({ language: lang, theme: dark ? "dark" : "light" })
    })
  }

  function currentTrip(id: string) {
    return get().trips.find((trip) => trip.id === id) ?? null
  }

  function finishReply(id: string, failed: boolean) {
    set((state) => ({
      pendingItineraryIds: state.pendingItineraryIds.filter((item) => item !== id),
      failedItineraryIds: failed
        ? state.failedItineraryIds.includes(id)
          ? state.failedItineraryIds
          : [...state.failedItineraryIds, id]
        : state.failedItineraryIds.filter((item) => item !== id),
    }))
  }

  return {
    hasHydrated: false,
    mode: "guest",
    lang: systemLang(),
    dark: prefersDark(),
    langChosen: false,
    darkChosen: false,
    trips: [],
    activeId: null,
    pendingItineraryIds: [],
    failedItineraryIds: [],
    syncError: null,

    enterGuest: () => {
      resetRequests()
      repository = guestRepository
      const snapshot = readGuestSnapshot()
      const lang = snapshot.lang ?? systemLang()
      const dark = snapshot.dark ?? prefersDark()
      applyDocumentPreferences(lang, dark)
      // Mode and data change in one update, so account trips are never written to guest storage.
      loadingGuestData = true
      set({
        mode: "guest",
        hasHydrated: true,
        trips: snapshot.trips,
        activeId: snapshot.activeId,
        lang,
        dark,
        langChosen: snapshot.lang !== undefined,
        darkChosen: snapshot.dark !== undefined,
        pendingItineraryIds: [],
        failedItineraryIds: [],
        syncError: null,
      })
      loadingGuestData = false
    },

    enterAccount: (settings, trips) => {
      resetRequests()
      repository = createAccountTripRepository()
      const dark = settings.theme === "dark"
      applyDocumentPreferences(settings.language, dark)
      set({
        mode: "account",
        hasHydrated: true,
        trips,
        activeId: trips[0]?.id ?? null,
        lang: settings.language,
        dark,
        // Account settings are explicit choices: they no longer follow the system.
        langChosen: true,
        darkChosen: true,
        pendingItineraryIds: [],
        failedItineraryIds: [],
        syncError: null,
      })
    },

    suspend: () => {
      resetRequests()
      set({ hasHydrated: false })
    },

    setLang: (lang) => {
      set({ lang, langChosen: true })
      persistSettings()
    },
    setDark: (dark) => {
      set({ dark, darkChosen: true })
      persistSettings()
    },
    followSystemLang: () => {
      const state = get()
      const lang = systemLang()
      if (state.langChosen || state.lang === lang) return
      set({ lang })
    },
    followSystemDark: () => {
      const state = get()
      const dark = prefersDark()
      if (state.darkChosen || state.dark === dark) return
      set({ dark })
    },

    createTrip: () => {
      const trip: Trip = {
        id: crypto.randomUUID(),
        name: "",
        details: { cityId: null, start: null, end: null, hotel: "", prefs: "" },
        place: null,
        messages: null,
        hints: [],
        plans: [],
        conversationContext: null,
      }
      set((state) => ({ trips: [trip, ...state.trips], activeId: trip.id }))
      persist(trip.id, () => repository.createTrip(trip))
    },
    selectTrip: (id) => set({ activeId: id }),
    renameTrip: (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      updateTrip(id, (trip) => ({ ...trip, name: trimmed }))
      persist(id, async () => {
        const trip = currentTrip(id)
        return trip ? repository.renameTrip(trip) : null
      })
    },
    deleteTrip: (id) => {
      invalidateReply(id)
      set((state) => {
        const trips = state.trips.filter((trip) => trip.id !== id)
        const activeId = state.activeId === id ? (trips[0]?.id ?? null) : state.activeId
        return { trips, activeId }
      })
      persist(null, () => repository.deleteTrip(id))
    },
    saveTrip: (id, value) => {
      const trip = currentTrip(id)
      if (!trip) return
      // A change to a trip with a conversation is shown as a notice and answered by the assistant;
      // the instruction for the model is written by the server from `update`.
      const update = trip.messages !== null ? tripUpdate(trip.details, value.details) : null
      if (update) invalidateReply(id)
      const notice: ChatMessage | null = update ? { id: crypto.randomUUID(), role: "system", text: "", update } : null
      updateTrip(id, (current) => {
        const messages = current.messages ?? []
        return { ...current, place: value.place, details: value.details, messages: notice ? [...messages, notice] : messages }
      })
      persist(id, async () => {
        const current = currentTrip(id)
        return current ? repository.saveTrip(current) : null
      })
    },
    sendMessage: (id, text) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const message: ChatMessage = { id: crypto.randomUUID(), role: "user", text: trimmed }
      // Stored with the reply request: the account API saves it before asking the model.
      updateTrip(id, (trip) => ({ ...trip, messages: [...(trip.messages ?? []), message] }))
    },

    requestReply: (id) => {
      const state = get()
      const trip = currentTrip(id)
      if (!trip || trip.messages === null || !needsReply(trip.messages) || repliesInFlight.has(id)) return
      if (!trip.place) {
        finishReply(id, true)
        return
      }
      repliesInFlight.add(id)
      const token = replyToken(id)
      const started = epoch
      const current = () => started === epoch && replyToken(id) === token
      set((value) => ({
        pendingItineraryIds: value.pendingItineraryIds.includes(id) ? value.pendingItineraryIds : [...value.pendingItineraryIds, id],
        failedItineraryIds: value.failedItineraryIds.filter((item) => item !== id),
      }))

      repository
        .requestReply(trip, state.lang)
        .then((reducer) => {
          if (!current()) return
          repliesInFlight.delete(id)
          updateTrip(id, reducer)
          finishReply(id, false)
        })
        .catch(async (error: unknown) => {
          if (!current()) return
          if (isUnauthorized(error)) onUnauthorized()
          if (failureCode(error) === "trip_changed") {
            // Edited elsewhere while the model was answering: take the stored trip; if it still
            // needs a reply, the chat asks again.
            try {
              const reducer = await repository.reloadTrip(id)
              if (!current()) return
              repliesInFlight.delete(id)
              if (reducer) updateTrip(id, reducer)
              finishReply(id, false)
              return
            } catch {
              // Fall through to the retry state.
            }
          }
          if (!current()) return
          repliesInFlight.delete(id)
          finishReply(id, true)
        })
    },

    retrySync: () => {
      const retries = failedWrites
      failedWrites = []
      set({ syncError: null })
      for (const retry of retries) retry()
    },
  }
})

// Guest data is written to localStorage on every change, as the persist middleware did before.
// Entering guest mode only reads: the stored data is rewritten on the first real change.
useChatStore.subscribe((state, previous) => {
  if (loadingGuestData || state.mode !== "guest" || !state.hasHydrated) return
  if (previous.mode !== "guest" || !previous.hasHydrated) return
  const unchanged =
    state.trips === previous.trips &&
    state.activeId === previous.activeId &&
    state.lang === previous.lang &&
    state.dark === previous.dark &&
    state.langChosen === previous.langChosen &&
    state.darkChosen === previous.darkChosen
  if (!unchanged) writeGuestSnapshot(guestSnapshot(state))
})
