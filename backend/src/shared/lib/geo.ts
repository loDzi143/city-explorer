export type Coordinates = {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_METERS = 6_371_000

/** Great-circle distance between two points (haversine). */
export function distanceMeters(left: Coordinates, right: Coordinates) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = toRad(right.latitude - left.latitude)
  const longitudeDelta = toRad(right.longitude - left.longitude)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRad(left.latitude)) * Math.cos(toRad(right.latitude)) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)))
}
