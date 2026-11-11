import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import Map, { Layer, Marker, Popup, Source, type MapRef } from "react-map-gl/maplibre"
import { setWorkerUrl, type Map as MaplibreMap, type PaddingOptions } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { Cross, Minus, Plus } from "@/components/icons"
import type { Dict } from "@/lib/i18n"

import type { MapFocus, MapPlaceRequest, MapStop } from "../types"

setWorkerUrl("/maplibre-gl-worker.mjs")

const MAP_STYLE = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
} as const

const ROUTE_COLOR = { light: "#2f6f64", dark: "#5fb8a6" } as const

function routeLine(stops: MapStop[]) {
  if (stops.length < 2) return null
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: stops.map((stop) => [stop.longitude, stop.latitude] as [number, number]),
    },
  }
}

function focusKey(focus: MapFocus | null) {
  if (!focus) return "world"
  return `${focus.id}:${focus.longitude}:${focus.latitude}:${focus.bbox?.join(",") ?? ""}`
}

function initialView(focus: MapFocus | null) {
  if (!focus) return { longitude: 0, latitude: 20, zoom: 1 }
  if (focus.bbox) {
    return {
      bounds: [
        [focus.bbox[0], focus.bbox[1]],
        [focus.bbox[2], focus.bbox[3]],
      ] as [[number, number], [number, number]],
      fitBoundsOptions: { padding: 64, maxZoom: 12 },
    }
  }
  return { longitude: focus.longitude, latitude: focus.latitude, zoom: 11 }
}

function samePoint(stops: MapStop[]) {
  const first = stops[0]
  return stops.every((stop) => stop.longitude === first.longitude && stop.latitude === first.latitude)
}

function frameStops(map: MaplibreMap, stops: MapStop[], duration: number) {
  const [first] = stops
  if (!first) return
  if (stops.length === 1 || samePoint(stops)) {
    map.flyTo({ center: [first.longitude, first.latitude], zoom: 14, duration })
    return
  }
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const stop of stops) {
    west = Math.min(west, stop.longitude)
    east = Math.max(east, stop.longitude)
    south = Math.min(south, stop.latitude)
    north = Math.max(north, stop.latitude)
  }
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { padding: { top: 120, right: 120, bottom: 104, left: 120 }, duration, maxZoom: 15 },
  )
}

function moveTo(map: MaplibreMap, focus: MapFocus | null, duration: number) {
  if (!focus) {
    map.flyTo({ center: [0, 20], zoom: 1, duration })
    return
  }
  if (focus.bbox) {
    map.fitBounds(
      [
        [focus.bbox[0], focus.bbox[1]],
        [focus.bbox[2], focus.bbox[3]],
      ],
      { padding: 64, duration, maxZoom: 12 },
    )
    return
  }
  map.flyTo({ center: [focus.longitude, focus.latitude], zoom: 11, duration })
}

const MAP_FRAME_OFFSET = 60 + 12 * 2

function obscuredLeft(host: HTMLElement) {
  const slot = host.parentElement
  if (!slot) return 0
  return Math.max(0, Math.round(host.clientWidth - slot.clientWidth))
}

function paddingMatches(current: PaddingOptions, left: number) {
  return (current.left ?? 0) === left && (current.right ?? 0) === 0 && (current.top ?? 0) === 0 && (current.bottom ?? 0) === 0
}

function applyInset(map: MaplibreMap, host: HTMLElement) {
  const left = obscuredLeft(host)
  if (paddingMatches(map.getPadding(), left)) return
  if (map.isMoving()) return
  const transform = map._camera.transform as unknown as { setPadding(padding: PaddingOptions): void }
  transform.setPadding({ left, right: 0, top: 0, bottom: 0 })
  map.triggerRepaint()
  // Markers listen for move, while padding only repaints the canvas. Update both together
  // so pins stay on the route while the chat or sidebar changes size.
  map.fire("move")
}

type PopupSide = "top" | "bottom" | "left" | "right"

function popupOffset(side: PopupSide): [number, number] {
  if (side === "top") return [0, 22]
  if (side === "bottom") return [0, -22]
  if (side === "left") return [22, 0]
  return [-22, 0]
}

function choosePopupSide(map: MaplibreMap, longitude: number, latitude: number, width: number, height: number, current: PopupSide): PopupSide {
  const point = map.project([longitude, latitude])
  const viewWidth = map.getContainer().clientWidth
  const viewHeight = map.getContainer().clientHeight
  const inset = map.getPadding().left ?? 0
  const margin = 12
  const gap = 22
  const bounds = { left: inset + margin, top: margin, right: viewWidth - margin, bottom: viewHeight - margin }
  const box = (side: PopupSide) => {
    if (side === "bottom") return { left: point.x - width / 2, right: point.x + width / 2, top: point.y - gap - height, bottom: point.y - gap }
    if (side === "top") return { left: point.x - width / 2, right: point.x + width / 2, top: point.y + gap, bottom: point.y + gap + height }
    if (side === "left") return { left: point.x + gap, right: point.x + gap + width, top: point.y - height / 2, bottom: point.y + height / 2 }
    return { left: point.x - gap - width, right: point.x - gap, top: point.y - height / 2, bottom: point.y + height / 2 }
  }
  const overflow = (side: PopupSide) => {
    const area = box(side)
    return (
      Math.max(0, bounds.left - area.left) +
      Math.max(0, area.right - bounds.right) +
      Math.max(0, bounds.top - area.top) +
      Math.max(0, area.bottom - bounds.bottom)
    )
  }
  const sides: PopupSide[] = ["bottom", "top", "left", "right"]
  if (overflow(current) === 0) return current
  return sides.reduce((best, side) => (overflow(side) < overflow(best) ? side : best))
}

export function MapView({
  dark,
  t,
  focus,
  day,
  stops,
  openPlace = null,
  frameOffset = MAP_FRAME_OFFSET,
}: {
  dark: boolean
  t: Dict
  focus: MapFocus | null
  day: string
  stops: MapStop[]
  /** Opens the popup of the stop with this id once it is on the map. */
  openPlace?: MapPlaceRequest | null
  frameOffset?: number
}) {
  const mapRef = useRef<MapRef>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [initialViewState] = useState(() => initialView(focus))
  const [initialKey] = useState(() => focusKey(focus))
  const seen = useRef(initialKey)
  const placed = useRef(false)
  const framed = useRef("")
  const [ready, setReady] = useState(false)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [width, setWidth] = useState(() => Math.max(1, document.documentElement.clientWidth - frameOffset))
  const key = focusKey(focus)
  const routeKey = stops.length ? `${day}:${stops.map((stop) => `${stop.longitude},${stop.latitude}`).join(";")}` : ""
  const route = useMemo(() => routeLine(stops), [stops])
  const routeColor = dark ? ROUTE_COLOR.dark : ROUTE_COLOR.light
  const openStop = openIndex !== null ? stops[openIndex] : undefined
  const [popupSide, setPopupSide] = useState<PopupSide>("bottom")

  useEffect(() => {
    const update = () => setWidth(Math.max(1, document.documentElement.clientWidth - frameOffset))
    const observer = new ResizeObserver(update)
    observer.observe(document.documentElement)
    update()
    return () => observer.disconnect()
  }, [frameOffset])

  useEffect(() => {
    const host = hostRef.current
    const slot = host?.parentElement
    if (!host || !slot) return
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const host = hostRef.current
        const map = mapRef.current?.getMap()
        if (host && map) applyInset(map, host)
      })
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(host)
    observer.observe(slot)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    const host = hostRef.current
    const map = mapRef.current?.getMap()
    if (!ready || !map || !host) return
    applyInset(map, host)
    const instant = !placed.current
    const focusChanged = !placed.current || seen.current !== key
    const routeChanged = routeKey !== "" && framed.current !== routeKey
    if (!focusChanged && !routeChanged) return
    placed.current = true
    seen.current = key
    if (!routeKey) framed.current = ""
    if (routeChanged) {
      framed.current = routeKey
      setOpenIndex(null)
      frameStops(map, stops, instant ? 0 : 800)
      return
    }
    if (focusChanged) moveTo(map, focus, instant ? 0 : 900)
  }, [ready, key, focus, routeKey, stops])

  // Runs after the framing effect above, which closes the popup when the day changes.
  const handledRequest = useRef(0)
  useLayoutEffect(() => {
    const map = mapRef.current?.getMap()
    if (!ready || !map || !openPlace || handledRequest.current === openPlace.seq) return
    const index = stops.findIndex((stop) => stop.id === openPlace.id)
    if (index < 0) return
    handledRequest.current = openPlace.seq
    // The request can only be served once the map is ready and the new day is framed.
    // oxlint-disable-next-line react/set-state-in-effect
    setOpenIndex(index)
    const stop = stops[index]
    if (!map.isMoving() && !map.getBounds().contains([stop.longitude, stop.latitude])) {
      map.easeTo({ center: [stop.longitude, stop.latitude], duration: 600 })
    }
  }, [ready, openPlace, stops])

  useLayoutEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !openStop) return
    const node = hostRef.current?.querySelector(".ce-place-popup")
    const rect = node?.getBoundingClientRect()
    const next = choosePopupSide(map, openStop.longitude, openStop.latitude, rect?.width || 260, rect?.height || 140, popupSide)
    if (next !== popupSide) setPopupSide(next)
  }, [openStop, popupSide])

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !openStop) return
    const place = () => {
      const node = hostRef.current?.querySelector(".ce-place-popup")
      const rect = node?.getBoundingClientRect()
      const width = rect && rect.width > 0 ? rect.width : 260
      const height = rect && rect.height > 0 ? rect.height : 140
      setPopupSide((current) => choosePopupSide(map, openStop.longitude, openStop.latitude, width, height, current))
    }
    map.on("move", place)
    return () => {
      map.off("move", place)
    }
  }, [openStop])

  useEffect(() => {
    if (openIndex === null) return
    const close = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(".ce-place-popup, .maplibregl-marker")) return
      setOpenIndex(null)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [openIndex])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current?.getMap()
    if (!map) return
    const onEnd = () => {
      const host = hostRef.current
      if (host) applyInset(map, host)
    }
    map.on("moveend", onEnd)
    return () => {
      map.off("moveend", onEnd)
    }
  }, [ready])

  return (
    <div ref={hostRef} className="absolute inset-y-0 right-0" style={{ width }} role="region" aria-label={t.mapLabel}>
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        minZoom={1}
        maxPitch={0}
        mapStyle={dark ? MAP_STYLE.dark : MAP_STYLE.light}
        dragPan
        scrollZoom
        boxZoom={false}
        dragRotate={false}
        pitchWithRotate={false}
        keyboard={false}
        doubleClickZoom={false}
        touchZoomRotate={false}
        touchPitch={false}
        onLoad={() => setReady(true)}
        reuseMaps
        style={{ width: "100%", height: "100%" }}
      >
        {route && (
          <Source id="trip-route" type="geojson" data={route}>
            <Layer
              id="trip-route-line"
              type="line"
              layout={{ "line-cap": "butt", "line-join": "round" }}
              paint={{
                "line-color": routeColor,
                "line-width": 2.5,
                "line-dasharray": [2, 2],
              }}
            />
          </Source>
        )}
        {stops.map((stop, index) => (
          <Marker key={`${stop.id}-${index}`} longitude={stop.longitude} latitude={stop.latitude} anchor="center">
            <span className="group relative block">
              {openIndex !== index && (
                <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 -translate-x-1/2 scale-95 rounded-lg border border-line bg-panel px-2 py-1 text-[12px] font-medium whitespace-nowrap text-ink opacity-0 shadow-md transition group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100">
                  {stop.name}
                </span>
              )}
              <button
                type="button"
                aria-label={`${index + 1}. ${stop.name}`}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseEnter={(event) => {
                  const marker = event.currentTarget.closest(".maplibregl-marker")
                  if (marker instanceof HTMLElement) marker.style.zIndex = "4"
                }}
                onMouseLeave={(event) => {
                  const marker = event.currentTarget.closest(".maplibregl-marker")
                  if (marker instanceof HTMLElement) marker.style.zIndex = ""
                }}
                onClick={() => setOpenIndex(index)}
                className="grid h-7 min-w-7 place-items-center rounded-full border-0 bg-brand px-1.5 text-[13px] font-semibold leading-none text-brand-ink shadow-md ring-2 ring-white"
              >
                {index + 1}
              </button>
            </span>
          </Marker>
        ))}
        {openStop && (
          <Popup
            longitude={openStop.longitude}
            latitude={openStop.latitude}
            anchor={popupSide}
            offset={popupOffset(popupSide)}
            closeButton={false}
            closeOnClick={false}
            className="ce-place-popup"
            maxWidth="280px"
            onClose={() => setOpenIndex(null)}
          >
            <div className="relative w-[240px] p-3 pr-8">
              <button
                type="button"
                aria-label={t.close}
                onClick={() => setOpenIndex(null)}
                className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md text-mute transition hover:bg-hover hover:text-ink"
              >
                <Cross />
              </button>
              <p className="text-sm font-medium leading-snug">{openStop.name}</p>
              {openStop.description.trim() && (
                <p className="mt-1 max-h-40 overflow-y-auto text-[13px] leading-relaxed text-mute">{openStop.description}</p>
              )}
            </div>
          </Popup>
        )}
      </Map>
      <div className="absolute right-4 top-4 z-10 flex flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
        <button
          type="button"
          aria-label={t.zoomIn}
          onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
          className="grid size-9 place-items-center text-ink transition hover:bg-hover"
        >
          <Plus />
        </button>
        <div className="h-px bg-line" />
        <button
          type="button"
          aria-label={t.zoomOut}
          onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
          className="grid size-9 place-items-center text-ink transition hover:bg-hover"
        >
          <Minus />
        </button>
      </div>
    </div>
  )
}
