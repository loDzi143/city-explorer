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

/** Asks the map to open a stop's popup. `seq` changes on every request so a repeated click reopens it. */
export type MapPlaceRequest = {
  id: string
  seq: number
}
