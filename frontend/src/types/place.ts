export type Place = {
  id: string
  city: string
  country: string
  countryCode: string | null
  longitude: number
  latitude: number
  bbox: [number, number, number, number] | null
}
