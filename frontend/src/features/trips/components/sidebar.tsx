import { useEffect, useState, type ReactNode } from "react"

import { Compass, Dots, Edit, Moon, Pin, Plus, SidebarR, Sun, Trash } from "@/components/icons"
import type { Dict } from "@/lib/i18n"
import { tripTitle } from "@/stores/chat-store"
import type { Trip } from "@/types/chat"
import type { Lang } from "@/types/lang"
import { tripPlace } from "@/utils/place"

function Segment({
  value,
  onChange,
  opts,
  label,
}: {
  value: string
  onChange: (value: string) => void
  opts: [string, ReactNode][]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-sunk p-1">
      {opts.map(([option, content]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={`h-8 flex-1 rounded-lg text-[13px] font-medium transition ${value === option ? "bg-panel text-ink shadow-sm ring-1 ring-line" : "text-mute hover:text-ink"}`}
        >
          {content}
        </button>
      ))}
    </div>
  )
}

export function Sidebar({
  t,
  lang,
  dark,
  collapsed,
  fill = false,
  className = "",
  trips,
  activeId,
  onToggle,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onLang,
  onDark,
}: {
  t: Dict
  lang: Lang
  dark: boolean
  collapsed: boolean
  fill?: boolean
  className?: string
  trips: Trip[]
  activeId: string | null
  onToggle: () => void
  onNew: () => void
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onLang: (lang: Lang) => void
  onDark: (dark: boolean) => void
}) {
  const [menu, setMenu] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const title = (trip: Trip) => tripTitle(trip, t)

  useEffect(() => {
    const close = () => setMenu(null)
    document.addEventListener("click", close)
    return () => document.removeEventListener("click", close)
  }, [])

  const rail = "grid size-10 place-items-center rounded-xl text-mute transition hover:bg-hover hover:text-ink"

  return (
    <aside className={`${className} min-h-0 shrink-0 flex-col bg-panel ${fill ? "h-full w-full" : `border-r border-line transition-[width] duration-300 ease-out ${collapsed ? "w-[60px]" : "w-[264px]"}`}`}>
      <div className={`flex h-14 items-center ${collapsed ? "justify-center" : "justify-between px-4"}`}>
        {collapsed ? (
          <button type="button" className={rail} onClick={onToggle} aria-label={t.expandSidebar} title={t.expandSidebar}>
            <SidebarR />
          </button>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-brand-ink">
                <Compass size={18} />
              </div>
              <span className="truncate font-display text-[17px] font-semibold tracking-[-0.03em]">CityExplorer</span>
            </div>
            {!fill && (
              <button type="button" className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-hover hover:text-ink" onClick={onToggle} aria-label={t.collapseSidebar} title={t.collapseSidebar}>
                <SidebarR />
              </button>
            )}
          </>
        )}
      </div>
      <div className={collapsed ? "flex flex-col items-center gap-1 pt-2" : "px-3 pt-1"}>
        {collapsed ? (
          <button type="button" onClick={onNew} aria-label={t.newTrip} title={t.newTrip} className="grid size-10 place-items-center rounded-xl bg-brand text-brand-ink transition hover:brightness-110">
            <Plus />
          </button>
        ) : (
          <button type="button" onClick={onNew} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-medium text-brand-ink transition hover:brightness-110 active:scale-[.99]">
            <Plus size={16} />
            {t.newTrip}
          </button>
        )}
      </div>
      {collapsed ? (
        <div className="mt-2 flex flex-1 flex-col items-center gap-1 overflow-y-auto">
          {trips.map((trip) => (
            <button
              key={trip.id}
              type="button"
              onClick={() => onSelect(trip.id)}
              title={title(trip)}
              aria-label={title(trip)}
              className={`grid size-10 place-items-center rounded-xl text-lg transition ${trip.id === activeId ? "bg-brand-soft" : "hover:bg-hover"}`}
            >
              {tripPlace(trip)?.flag ?? (
                <span className="text-mute">
                  <Pin />
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="px-5 pb-1.5 pt-5 text-[11px] font-medium uppercase tracking-[.08em] text-mute">{t.trips}</div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
            {trips.length === 0 && <p className="px-3 py-2 text-sm text-mute">{t.noTrips}</p>}
            {trips.map((trip) => {
              const active = trip.id === activeId
              return (
                <div key={trip.id} className="group relative">
                  {renaming === trip.id ? (
                    <input
                      autoFocus
                      defaultValue={title(trip)}
                      onBlur={(event) => {
                        if (event.currentTarget.dataset.cancel !== "true") onRename(trip.id, event.currentTarget.value)
                        setRenaming(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur()
                        if (event.key === "Escape") {
                          event.currentTarget.dataset.cancel = "true"
                          event.currentTarget.blur()
                        }
                      }}
                      className="h-9 w-full rounded-lg border border-brand bg-sunk px-3 text-sm outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelect(trip.id)}
                      className={`flex h-9 w-full items-center gap-2.5 rounded-lg pl-3 pr-9 text-left text-sm transition ${active ? "bg-hover font-medium" : "text-ink/80 hover:bg-hover/70"}`}
                    >
                      <span className="text-base leading-none">{tripPlace(trip)?.flag ?? "✦"}</span>
                      <span className="truncate">{title(trip)}</span>
                    </button>
                  )}
                  {renaming !== trip.id && (
                    <button
                      type="button"
                      aria-label={t.menu}
                      onClick={(event) => {
                        event.stopPropagation()
                        setMenu(menu === trip.id ? null : trip.id)
                      }}
                      className={`absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md text-mute hover:bg-line hover:text-ink ${menu === trip.id ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"}`}
                    >
                      <Dots />
                    </button>
                  )}
                  {menu === trip.id && (
                    <div onClick={(event) => event.stopPropagation()} className="absolute right-1 top-9 z-30 w-40 rounded-xl border border-line bg-panel p-1 shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setRenaming(trip.id)
                          setMenu(null)
                        }}
                        className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-sm hover:bg-hover"
                      >
                        <Edit />
                        {t.rename}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(trip.id)
                          setMenu(null)
                        }}
                        className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-sm text-red-500 hover:bg-hover"
                      >
                        <Trash />
                        {t.del}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
        </>
      )}
      <div className={`border-t border-line ${collapsed ? "flex flex-col items-center gap-1 py-3" : "space-y-2 p-3"}`}>
        {collapsed ? (
          <>
            <button type="button" className={rail} title={t.language} aria-label={t.language} onClick={() => onLang(lang === "en" ? "ru" : "en")}>
              <span className="text-[11px] font-semibold">{lang === "en" ? "EN" : "RU"}</span>
            </button>
            <button type="button" className={rail} title={t.theme} aria-label={t.theme} onClick={() => onDark(!dark)}>
              {dark ? <Sun /> : <Moon />}
            </button>
          </>
        ) : (
          <>
            <Segment value={lang} onChange={(value) => onLang(value as Lang)} label={t.language} opts={[["ru", "RU"], ["en", "ENG"]]} />
            <Segment
              value={dark ? "d" : "l"}
              onChange={(value) => onDark(value === "d")}
              label={t.theme}
              opts={[
                ["l", <span key="light" className="flex items-center justify-center gap-1.5"><Sun />{t.light}</span>],
                ["d", <span key="dark" className="flex items-center justify-center gap-1.5"><Moon />{t.dark}</span>],
              ]}
            />
          </>
        )}
      </div>
    </aside>
  )
}
