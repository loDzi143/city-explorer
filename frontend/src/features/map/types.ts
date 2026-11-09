export type MapFocus = {
  id: string
  longitude: number
  latitude: number
  bbox: [number, number, number, number] | null
}

export type MapStop = {
  id: string
  name: string
  description: string
  longitude: number
  latitude: number
}
