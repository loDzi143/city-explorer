import type { StorageMode } from "@/types/account"
import type { Trip } from "@/types/chat"
import type { Lang } from "@/types/lang"

/** Applies a stored result to the trip as it is in memory when the result arrives. */
export type TripReducer = (current: Trip) => Trip

/**
 * Where trips are persisted. The chat store applies every change to its in-memory state first
 * and then hands it to the repository of the current mode:
 *
 * - guest: the store snapshot is written to localStorage, so these calls have nothing to do except
 *   replies, which go to POST /api/chat;
 * - account: each call is a request to the API; the trip the server returns replaces the local one.
 *
 * A method resolving to null means the local state already is the stored state.
 */
export interface TripRepository {
  readonly mode: StorageMode
  createTrip(trip: Trip): Promise<TripReducer | null>
  renameTrip(trip: Trip): Promise<TripReducer | null>
  /** Saves destination and settings; `trip` already contains them. */
  saveTrip(trip: Trip): Promise<TripReducer | null>
  deleteTrip(id: string): Promise<void>
  /** Gets the assistant reply for the trip's unanswered messages. */
  requestReply(trip: Trip, lang: Lang): Promise<TripReducer>
  /** The stored version of a trip, to recover after a conflict. Null for guests. */
  reloadTrip(id: string): Promise<TripReducer | null>
}
