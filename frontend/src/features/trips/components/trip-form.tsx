import { useState, type FormEvent } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { Compass, Pin } from "@/components/icons"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { useDebounced } from "@/hooks/use-debounced"
import type { Dict } from "@/lib/i18n"
import type { SettingsNotice, Trip, TripSettings } from "@/types/chat"
import type { Lang } from "@/types/lang"
import type { Place } from "@/types/place"
import { tripPlace } from "@/utils/place"

import { suggestLocations } from "../api/suggest-locations"
import { settingsUpdateNotice } from "../utils/settings-update"
import { DatePicker } from "./date-picker"

function placeFromTrip(trip: Trip): Place | null {
  const current = tripPlace(trip)
  if (!current) return null
  return {
    id: current.id,
    city: current.city,
    country: current.country,
    countryCode: current.countryCode,
    longitude: current.longitude,
    latitude: current.latitude,
    bbox: current.bbox,
  }
}

export function TripForm({
  trip,
  t,
  lang,
  editing,
  onSubmit,
  onCancel,
}: {
  trip: Trip
  t: Dict
  lang: Lang
  editing?: boolean
  onSubmit: (value: TripSettings, notice?: SettingsNotice | null) => void
  onCancel?: () => void
}) {
  const [place, setPlace] = useState<Place | null>(() => placeFromTrip(trip))
  const [query, setQuery] = useState(() => placeFromTrip(trip)?.city ?? "")
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState(trip.details.start)
  const [end, setEnd] = useState(trip.details.end)
  const [hotel, setHotel] = useState(trip.details.hotel)
  const [prefs, setPrefs] = useState(trip.details.prefs)
  const [tried, setTried] = useState(false)
  const debounced = useDebounced(query.trim(), 250)
  const suggestionsQuery = useQuery({
    queryKey: ["locations", "suggest", lang, debounced],
    queryFn: () => suggestLocations(debounced, lang),
    enabled: !editing && debounced.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
  const suggestions = debounced.length >= 2 ? (suggestionsQuery.data ?? []) : []
  const pending = query.trim().length >= 2 && (query.trim() !== debounced || suggestionsQuery.isFetching)
  const selected = Boolean(place && query.trim() === place.city)

  const cityError = tried && !editing && !selected
  const dateError = tried && !(start && end)
  const current = trip.details
  const changed = start !== current.start || end !== current.end || hotel.trim() !== current.hotel.trim() || prefs.trim() !== current.prefs.trim()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (editing && !changed) return
    setTried(true)
    if (place && (editing || selected) && start && end) {
      const details = { cityId: place.id, start, end, hotel: hotel.trim(), prefs: prefs.trim() }
      onSubmit({ place, details }, editing ? settingsUpdateNotice(current, details) : null)
    }
  }

  const field =
    "w-full rounded-xl border border-line bg-sunk px-3.5 text-sm placeholder:text-mute transition hover:border-mute/50 focus:outline-none focus:ring-2 focus:ring-brand/40"
  const label = "mb-1.5 flex items-center justify-between text-[13px] font-medium"
  const emptyLabel = pending ? t.searching : suggestionsQuery.isError ? t.citySearchError : t.noCity

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-4 py-6 md:px-6 md:py-8">
      <form onSubmit={submit} noValidate className="w-full max-w-[520px]">
        <div className="mb-4 grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
          <Compass size={22} />
        </div>
        <h1 className="font-display text-2xl font-semibold leading-tight tracking-[-0.03em] md:text-[28px]">{t.heading}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-mute">{t.sub}</p>
        <div className="mt-7 space-y-5">
          <div>
            <label className={label} htmlFor="city">
              {t.dest}
            </label>
            {editing ? (
              <div className="group relative">
                <input
                  id="city"
                  value={place?.city ?? ""}
                  disabled
                  readOnly
                  aria-describedby="city-locked"
                  className={`${field} pointer-events-none h-11 text-mute`}
                />
                <div className="absolute inset-0 cursor-not-allowed" />
                <p
                  id="city-locked"
                  role="tooltip"
                  className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-20 max-w-full rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-snug text-bg opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                >
                  {t.cityLocked}
                </p>
              </div>
            ) : (
              <Combobox
                items={suggestions}
                value={place}
                onValueChange={setPlace}
                inputValue={query}
                onInputValueChange={setQuery}
                open={open && query.trim().length >= 2}
                onOpenChange={setOpen}
                itemToStringLabel={(item) => item.city}
                isItemEqualToValue={(item, selectedPlace) => item.id === selectedPlace.id}
                filter={null}
                autoHighlight
              >
                <ComboboxInput
                  id="city"
                  showTrigger={false}
                  autoComplete="off"
                  placeholder={t.destPh}
                  aria-invalid={cityError || undefined}
                  className={`h-11 w-full rounded-xl border-line bg-sunk shadow-none hover:border-mute/50 has-[[data-slot=input-group-control]:focus-visible]:border-brand/60 has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-brand/20 [&_input]:h-full [&_input]:px-3.5 [&_input]:text-sm [&_input]:text-ink [&_input]:placeholder:text-mute ${cityError ? "border-red-400" : ""}`}
                />
                <ComboboxContent className="min-w-(--anchor-width) rounded-xl border border-line bg-panel text-ink shadow-xl ring-0">
                  <ComboboxEmpty className="py-2.5 text-mute">{emptyLabel}</ComboboxEmpty>
                  <ComboboxList className="max-h-60">
                    {(item) => (
                      <ComboboxItem key={item.id} value={item} className="items-start rounded-lg px-3 py-2 data-highlighted:bg-hover data-highlighted:text-ink">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium leading-5">{item.city}</span>
                          {item.country ? <span className="truncate text-xs leading-4 text-mute">{item.country}</span> : null}
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            )}
            {cityError && <p className="mt-1.5 text-xs text-red-500">{t.errCity}</p>}
            {!cityError && suggestionsQuery.isError && query.trim().length >= 2 && (
              <p className="mt-1.5 text-xs text-red-500">{t.citySearchError}</p>
            )}
          </div>
          <div>
            <label className={label}>{t.dates}</label>
            <DatePicker
              start={start}
              end={end}
              t={t}
              invalid={dateError}
              onChange={(nextStart, nextEnd) => {
                setStart(nextStart)
                setEnd(nextEnd)
              }}
            />
            {dateError && <p className="mt-1.5 text-xs text-red-500">{t.errDates}</p>}
          </div>
          <div>
            <label className={label} htmlFor="hotel">
              {t.hotel}
              <span className="text-xs font-normal text-mute">{t.optional}</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-3 text-mute">
                <Pin />
              </span>
              <input id="hotel" value={hotel} onChange={(event) => setHotel(event.target.value)} placeholder={t.hotelPh} className={`${field} h-11 pl-10`} />
            </div>
            <p className="mt-1.5 text-xs text-mute">{t.hotelHelp}</p>
          </div>
          <div>
            <label className={label} htmlFor="prefs">
              {t.prefs}
              <span className="text-xs font-normal text-mute">{t.optional}</span>
            </label>
            <textarea
              id="prefs"
              rows={3}
              value={prefs}
              onChange={(event) => setPrefs(event.target.value)}
              placeholder={t.prefsPh}
              className={`${field} resize-none py-3 leading-relaxed`}
            />
            <p className="mt-1.5 text-xs text-mute">{t.prefsHelp}</p>
          </div>
        </div>
        <div className="mt-7 flex gap-3">
          {editing && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="h-12 flex-1 rounded-xl border border-line bg-panel text-[15px] font-medium transition hover:bg-hover focus:outline-none focus:ring-2 focus:ring-brand/40"
            >
              {t.cancel}
            </button>
          )}
          <button
            type="submit"
            disabled={editing && !changed}
            className={`h-12 rounded-xl bg-brand text-[15px] font-medium text-brand-ink transition hover:brightness-110 active:scale-[.99] focus:outline-none focus:ring-2 focus:ring-brand/50 focus:ring-offset-2 focus:ring-offset-panel disabled:pointer-events-none disabled:opacity-35 disabled:active:scale-100 ${editing ? "flex-1" : "w-full"}`}
          >
            {editing ? t.save : t.create} {!editing && "→"}
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-mute">{t.note}</p>
      </form>
    </div>
  )
}
