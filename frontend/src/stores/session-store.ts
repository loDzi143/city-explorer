import { create } from "zustand"

import { apiFailure, isUnauthorized } from "@/lib/api"
import * as authClient from "@/lib/auth-client"
import type { Credentials, GuestTripPayload } from "@/lib/auth-client"
import { fetchAccountTrips } from "@/lib/repositories/account-trip-repository"
import { clearGuestTrips, hadAccountSession, readGuestSnapshot, rememberAccountSession } from "@/lib/repositories/guest-storage"
import { setUnauthorizedHandler, useChatStore } from "@/stores/chat-store"
import type { Account, User } from "@/types/account"
import type { Trip } from "@/types/chat"
import { messageUpdate } from "@/utils/trip-update"

/**
 * - initializing: checking the session; nothing is shown yet, so guest data never flashes for a user
 * - guest: data in localStorage
 * - account-loading: signed in, account data is loading
 * - account: data from the API
 * - account-error: signed in (or probably signed in), but the account couldn't be loaded
 */
export type SessionStatus = "initializing" | "guest" | "account-loading" | "account" | "account-error"

/** Why a sign-in or registration failed, for a localized message. */
export type AuthErrorReason = "invalid_credentials" | "username_taken" | "rate_limited" | "validation" | "network" | "server"

export type AuthResult = { ok: true } | { ok: false; reason: AuthErrorReason; message: string | null }

/** Signed in while guest trips exist: the user chooses whether to move them into the account. */
export type ImportOffer = {
  account: Account
  tripCount: number
  importing: boolean
  failed: boolean
}

type SessionState = {
  status: SessionStatus
  user: User | null
  /** The session ended on the server while the user was working. */
  expired: boolean
  importOffer: ImportOffer | null
  signingOut: boolean
  signOutFailed: boolean
  initialize: () => Promise<void>
  retry: () => Promise<void>
  continueAsGuest: () => void
  login: (credentials: Credentials) => Promise<AuthResult>
  register: (credentials: Credentials) => Promise<AuthResult>
  logout: () => Promise<void>
  importGuestData: () => Promise<void>
  skipImport: () => Promise<void>
  dismissExpired: () => void
}

function authError(error: unknown): AuthResult {
  const failure = apiFailure(error)
  if (failure.kind === "network") return { ok: false, reason: "network", message: null }
  if (failure.code === "invalid_credentials" || failure.code === "username_taken" || failure.code === "rate_limited") {
    return { ok: false, reason: failure.code, message: failure.message }
  }
  if (failure.status === 400) return { ok: false, reason: "validation", message: failure.message }
  return { ok: false, reason: "server", message: failure.message }
}

/** Guest trips worth importing: anything the user created, including unfinished drafts with a name. */
function guestTrips() {
  return readGuestSnapshot().trips.filter((trip) => trip.place || trip.name.trim())
}

/** The guest trip in the shape the import endpoint validates. */
export function toGuestTripPayload(trip: Trip): GuestTripPayload {
  return {
    id: trip.id,
    name: trip.name,
    place: trip.place,
    details: { start: trip.details.start, end: trip.details.end, hotel: trip.details.hotel, prefs: trip.details.prefs },
    messages:
      trip.messages?.flatMap((message): NonNullable<GuestTripPayload["messages"]> => {
        if (message.role !== "system") return message.text.trim() ? [{ role: message.role, text: message.text }] : []
        const update = messageUpdate(message)
        return update ? [{ role: "system", update }] : []
      }) ?? null,
    hints: trip.hints,
    plans: trip.plans,
    conversationContext: trip.conversationContext,
  }
}

let initialized: Promise<void> | null = null

export const useSessionStore = create<SessionState>()((set, get) => {
  async function openAccount(account: Account) {
    rememberAccountSession(true)
    set({ status: "account-loading", user: account.user, expired: false, importOffer: null })
    useChatStore.getState().suspend()
    try {
      const trips = await fetchAccountTrips()
      useChatStore.getState().enterAccount(account.settings, trips)
      set({ status: "account" })
    } catch (error) {
      if (isUnauthorized(error)) {
        openGuest(true)
        return
      }
      set({ status: "account-error" })
    }
  }

  function openGuest(expired = false) {
    rememberAccountSession(false)
    useChatStore.getState().enterGuest()
    set({ status: "guest", user: null, expired, importOffer: null })
  }

  /** After a successful sign-in: offer the import when guest trips exist, otherwise open the account. */
  async function signedIn(account: Account) {
    const previous = get()
    // Same user after an expired session: keep the screen and resend what failed to save.
    if (previous.status === "account" && previous.expired && previous.user?.id === account.user.id) {
      rememberAccountSession(true)
      set({ expired: false })
      useChatStore.getState().retrySync()
      return
    }
    const count = previous.status === "guest" ? guestTrips().length : 0
    if (count > 0) {
      rememberAccountSession(true)
      set({ importOffer: { account, tripCount: count, importing: false, failed: false }, user: account.user })
      return
    }
    await openAccount(account)
  }

  return {
    status: "initializing",
    user: null,
    expired: false,
    importOffer: null,
    signingOut: false,
    signOutFailed: false,

    initialize: () => {
      initialized ??= (async () => {
        try {
          await openAccount(await authClient.fetchAccount())
        } catch (error) {
          if (isUnauthorized(error)) {
            // A remembered session that is gone now has expired; tell the user once.
            openGuest(hadAccountSession())
            return
          }
          // The server can't say who this is. A guest browser goes on with local data; a browser that
          // had an account waits for the server instead of silently becoming a guest.
          if (hadAccountSession()) set({ status: "account-error" })
          else openGuest()
        }
      })()
      return initialized
    },

    retry: async () => {
      set({ status: "initializing" })
      initialized = null
      await get().initialize()
    },

    /** Works locally for now; the account session (if any) is kept and checked on the next start. */
    continueAsGuest: () => {
      useChatStore.getState().enterGuest()
      set({ status: "guest", user: null, expired: false })
    },

    login: async (credentials) => {
      try {
        await signedIn(await authClient.login(credentials))
        return { ok: true }
      } catch (error) {
        return authError(error)
      }
    },

    register: async (credentials) => {
      const { lang, dark } = useChatStore.getState()
      try {
        await signedIn(await authClient.register(credentials, { language: lang, theme: dark ? "dark" : "light" }))
        return { ok: true }
      } catch (error) {
        return authError(error)
      }
    },

    logout: async () => {
      set({ signingOut: true, signOutFailed: false })
      try {
        await authClient.logout()
      } catch (error) {
        // Without the server the cookie can't be cleared; stay signed in rather than pretend.
        if (!isUnauthorized(error)) {
          set({ signingOut: false, signOutFailed: true })
          return
        }
      }
      set({ signingOut: false })
      // Guest data was not touched while signed in; it comes back as it was.
      openGuest()
    },

    importGuestData: async () => {
      const offer = get().importOffer
      if (!offer || offer.importing) return
      set({ importOffer: { ...offer, importing: true, failed: false } })
      try {
        await authClient.importGuestTrips(guestTrips().map(toGuestTripPayload))
      } catch (error) {
        // Local data stays untouched; the user can retry or skip.
        if (isUnauthorized(error)) {
          openGuest(true)
          return
        }
        set({ importOffer: { ...offer, importing: false, failed: true } })
        return
      }
      // The trips now live in the account; remove them only after the server confirmed.
      clearGuestTrips()
      await openAccount(offer.account)
    },

    skipImport: async () => {
      const offer = get().importOffer
      if (!offer || offer.importing) return
      await openAccount(offer.account)
    },

    dismissExpired: () => set({ expired: false }),
  }
})

setUnauthorizedHandler(() => {
  if (useSessionStore.getState().status === "account") useSessionStore.setState({ expired: true })
})
