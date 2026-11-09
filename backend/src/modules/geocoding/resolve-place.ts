import type { PlaceCandidate, ResolvedPlace } from "@/modules/geocoding/geocoding.types"

const MIN_RELEVANCE = 0.9
const CLEAR_GAP = 0.12
const SAME_PLACE_METERS = 150

export function resolvePlace(requestedName: string, candidates: PlaceCandidate[]): ResolvedPlace {
  const ranked = dedupe(candidates).sort((left, right) => right.relevance - left.relevance)
  const plausible = ranked.filter((candidate) => candidate.relevance >= MIN_RELEVANCE)
  if (plausible.length === 0) return { status: "not_found" }

  const named = plausible.filter((candidate) => nameMatches(requestedName, candidate.name))
  const pool = named.length > 0 ? named : plausible
  const best = pool[0]
  if (!best) return { status: "not_found" }

  const rivals = pool.slice(1).filter((candidate) => {
    if (samePlace(best, candidate)) return false
    return best.relevance - candidate.relevance < CLEAR_GAP
  })
  if (rivals.length > 0) return { status: "ambiguous" }

  return {
    status: "found",
    id: best.id,
    matchedName: best.name,
    coordinates: {
      latitude: best.latitude,
      longitude: best.longitude,
    },
  }
}

function dedupe(candidates: PlaceCandidate[]) {
  const seen = new Set<string>()
  const unique: PlaceCandidate[] = []
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue
    seen.add(candidate.id)
    unique.push(candidate)
  }
  return unique
}

function nameMatches(requestedName: string, candidateName: string) {
  const requested = normalizeName(requestedName)
  const candidate = normalizeName(candidateName)
  if (!requested || !candidate) return false
  return candidate.includes(requested) || requested.includes(candidate)
}

function normalizeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function samePlace(left: PlaceCandidate, right: PlaceCandidate) {
  if (left.id === right.id) return true
  if (normalizeName(left.name) !== normalizeName(right.name)) return false
  return distanceMeters(left, right) <= SAME_PLACE_METERS
}

function distanceMeters(left: PlaceCandidate, right: PlaceCandidate) {
  const earth = 6_371_000
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = toRad(right.latitude - left.latitude)
  const longitudeDelta = toRad(right.longitude - left.longitude)
  const leftLatitude = toRad(left.latitude)
  const rightLatitude = toRad(right.latitude)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(haversine)))
}
