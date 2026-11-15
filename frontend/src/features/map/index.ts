import { lazy } from "react"

export { MapDaySelect } from "./components/map-day-select"
export type { MapFocus, MapPlaceRequest, MapStop } from "./types"

// MapLibre is about half of the app's JavaScript. Loading it on demand lets the chat and the trip
// list appear first; render MapView inside <Suspense>.
export const MapView = lazy(() => import("./components/map-view").then((module) => ({ default: module.MapView })))
