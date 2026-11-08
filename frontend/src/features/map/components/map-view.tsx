import { useEffect, useLayoutEffect, useRef, useState } from "react"
import Map, { type MapRef } from "react-map-gl/maplibre"
import { setWorkerUrl, type Map as MaplibreMap, type PaddingOptions } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { Minus, Plus } from "@/components/icons"
import type { Dict } from "@/lib/i18n"

import type { MapFocus } from "../types"

setWorkerUrl("/maplibre-gl-worker.mjs")

const MAP_STYLE = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
} as const

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
}

export function MapView({ dark, t, focus, frameOffset = MAP_FRAME_OFFSET }: { dark: boolean; t: Dict; focus: MapFocus | null; frameOffset?: number }) {
  const mapRef = useRef<MapRef>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [initialViewState] = useState(() => initialView(focus))
  const [initialKey] = useState(() => focusKey(focus))
  const seen = useRef(initialKey)
  const placed = useRef(false)
  const [ready, setReady] = useState(false)
  const [width, setWidth] = useState(() => Math.max(1, document.documentElement.clientWidth - frameOffset))
  const key = focusKey(focus)

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
    if (placed.current && seen.current === key) return
    const instant = !placed.current
    placed.current = true
    seen.current = key
    moveTo(map, focus, instant ? 0 : 900)
  }, [ready, key, focus])

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
      />
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
