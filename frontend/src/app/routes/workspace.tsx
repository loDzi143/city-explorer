import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ChatI, Chev, Compass, MapI } from "@/components/icons"
import { ChatView, Sidebar, TripForm } from "@/features/trips"
import { MapView } from "@/features/map"
import { useMediaQuery } from "@/hooks/use-media-query"
import { tr } from "@/lib/i18n"
import { chatTitle, useChatStore } from "@/stores/chat-store"
import { rangeLabel } from "@/utils/dates"
import { tripPlace } from "@/utils/place"

const MOBILE_QUERY = "(max-width: 767px)"
type MobilePane = "history" | "chat" | "map"

export function WorkspacePage() {
  const hydrated = useChatStore((state) => state.hasHydrated)
  const lang = useChatStore((state) => state.lang)
  const dark = useChatStore((state) => state.dark)
  const chats = useChatStore((state) => state.chats)
  const activeId = useChatStore((state) => state.activeId)
  const setLang = useChatStore((state) => state.setLang)
  const setDark = useChatStore((state) => state.setDark)
  const createChat = useChatStore((state) => state.createChat)
  const selectChat = useChatStore((state) => state.selectChat)
  const renameChat = useChatStore((state) => state.renameChat)
  const deleteChat = useChatStore((state) => state.deleteChat)
  const saveTrip = useChatStore((state) => state.saveTrip)
  const sendMessage = useChatStore((state) => state.sendMessage)
  const beginItinerary = useChatStore((state) => state.beginItinerary)
  const finishItinerary = useChatStore((state) => state.finishItinerary)
  const failItinerary = useChatStore((state) => state.failItinerary)
  const pendingItineraryIds = useChatStore((state) => state.pendingItineraryIds)
  const failedItineraryIds = useChatStore((state) => state.failedItineraryIds)

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1100)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [mobilePane, setMobilePane] = useState<MobilePane>("chat")
  const mobile = useMediaQuery(MOBILE_QUERY)
  const wasMobile = useRef(mobile)

  const t = tr(lang)
  const chat = chats.find((item) => item.id === activeId) ?? null
  const beginActiveItinerary = useCallback(() => (chat ? beginItinerary(chat.id) : false), [beginItinerary, chat])
  const finishActiveItinerary = useCallback(
    (text: string) => {
      if (chat) finishItinerary(chat.id, text)
    },
    [chat, finishItinerary],
  )
  const failActiveItinerary = useCallback(() => {
    if (chat) failItinerary(chat.id)
  }, [chat, failItinerary])
  const place = useMemo(() => (chat ? tripPlace(chat) : null), [chat])
  const showForm = Boolean(chat && (chat.messages === null || editing))
  const mapFocus = useMemo(
    () =>
      chat?.messages != null && place
        ? { id: place.id, longitude: place.longitude, latitude: place.latitude, bbox: place.bbox }
        : null,
    [chat?.messages, place],
  )

  useEffect(() => {
    if (!hydrated || chats.length === 0) return
    if (chats.some((item) => item.id === activeId)) return
    selectChat(chats[0].id)
  }, [hydrated, chats, activeId, selectChat])

  useEffect(() => {
    const entered = mobile && !wasMobile.current
    wasMobile.current = mobile
    if (entered) setMobilePane(chatCollapsed ? "map" : "chat")
  }, [mobile, chatCollapsed])

  if (!hydrated) return <div className="h-screen w-full bg-bg" />

  const title = chat ? chatTitle(chat, t) : t.newTrip

  const onNew = () => {
    setEditing(false)
    setChatCollapsed(false)
    setMobilePane("chat")
    createChat()
  }

  const showHistory = !mobile || mobilePane === "history"
  const showChat = !mobile || mobilePane === "chat"
  const showMap = !mobile || mobilePane === "map"

  const openMap = () => {
    if (mobile) setMobilePane("map")
    else setChatCollapsed(true)
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] font-sans text-ink">
      <Sidebar
        t={t}
        lang={lang}
        dark={dark}
        collapsed={mobile ? false : sidebarCollapsed}
        fill={mobile}
        className={showHistory ? "flex" : "hidden"}
        chats={chats}
        activeId={chat?.id ?? null}
        onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onNew={onNew}
        onSelect={(id) => {
          setEditing(false)
          selectChat(id)
          if (mobile) setMobilePane("chat")
        }}
        onRename={renameChat}
        onDelete={(id) => {
          setEditing(false)
          deleteChat(id)
        }}
        onLang={setLang}
        onDark={setDark}
      />
      <main className={`min-h-0 min-w-0 flex-1 ${showHistory && mobile ? "hidden" : "flex"} ${mobile ? "" : "gap-3 p-3"}`}>
        <section
          inert={!showChat || undefined}
          aria-hidden={!showChat}
          className={`${showChat ? "flex" : "hidden"} h-full min-h-0 min-w-0 flex-col overflow-hidden bg-panel ${mobile ? "w-full flex-1" : `shrink-0 grow-0 rounded-2xl border border-line shadow-sm transition-[flex-basis,opacity,margin] duration-300 ease-out ${chatCollapsed ? "basis-0 border-0 opacity-0 -mr-3" : "basis-[46%] max-lg:basis-[55%]"}`}`}
        >
          <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-3 md:px-5">
            {mobile && (
              <button
                type="button"
                onClick={() => setMobilePane("history")}
                aria-label={t.trips}
                title={t.trips}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-hover hover:text-ink"
              >
                <Chev d="l" />
              </button>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="text-lg">{place?.flag ?? "✦"}</span>
              <h2 className="truncate text-[15px] font-medium">{title}</h2>
              {place && chat?.start && chat.end && !showForm && (
                <span className="hidden truncate text-xs text-mute xl:inline">{rangeLabel(chat.start, chat.end, t)}</span>
              )}
            </div>
            <button
              type="button"
              onClick={openMap}
              aria-label={mobile ? t.tripMap : t.collapseChat}
              title={mobile ? t.tripMap : t.collapseChat}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-hover hover:text-ink"
            >
              {mobile ? <MapI /> : <Chev d="l" />}
            </button>
          </header>
          <div className="min-h-0 min-w-0 flex-1 md:min-w-[380px]">
            {chat && showForm ? (
              <TripForm
                key={`${chat.id}-${editing}`}
                chat={chat}
                t={t}
                lang={lang}
                editing={editing && chat.messages !== null}
                onSubmit={(value) => {
                  saveTrip(chat.id, value)
                  setEditing(false)
                }}
              />
            ) : chat ? (
              <ChatView
                key={chat.id}
                chat={chat}
                t={t}
                lang={lang}
                onSend={(text) => sendMessage(chat.id, text)}
                onEdit={() => setEditing(true)}
                itineraryPending={pendingItineraryIds.includes(chat.id)}
                itineraryFailed={failedItineraryIds.includes(chat.id)}
                onBeginItinerary={beginActiveItinerary}
                onItinerary={finishActiveItinerary}
                onItineraryError={failActiveItinerary}
              />
            ) : (
              <div className="flex h-full items-center justify-center overflow-y-auto px-4 py-6 md:px-6 md:py-8">
                <div className="w-full max-w-[520px] text-center">
                  <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Compass size={22} />
                  </div>
                  <h1 className="font-display text-2xl font-semibold leading-tight tracking-[-0.03em] md:text-[28px]">{t.heading}</h1>
                  <p className="mt-2 text-[15px] leading-relaxed text-mute">{t.noTrips}</p>
                  <button
                    type="button"
                    onClick={onNew}
                    className="mt-7 h-12 w-full rounded-xl bg-brand text-[15px] font-medium text-brand-ink transition hover:brightness-110 active:scale-[.99]"
                  >
                    {t.newTrip}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
        <section
          inert={!showMap || undefined}
          aria-hidden={!showMap}
          className={`relative h-full min-h-0 min-w-0 overflow-hidden ${showMap ? "flex-1" : "hidden"} ${mobile ? "w-full" : "rounded-2xl border border-line shadow-sm"}`}
        >
          <MapView dark={dark} t={t} focus={mapFocus} frameOffset={mobile ? 0 : undefined} />
          {mobile ? (
            showMap && (
              <button
                type="button"
                onClick={() => setMobilePane("chat")}
                aria-label={t.expandChat}
                title={t.expandChat}
                className="absolute left-4 top-4 z-10 grid size-9 place-items-center rounded-xl border border-line bg-panel text-ink shadow-sm transition hover:bg-hover"
              >
                <ChatI />
              </button>
            )
          ) : (
            chatCollapsed && (
              <button
                type="button"
                onClick={() => setChatCollapsed(false)}
                className="absolute left-4 top-4 z-10 flex h-9 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-[13px] font-medium shadow-sm transition hover:bg-hover"
              >
                <ChatI />
                {t.expandChat}
              </button>
            )
          )}
        </section>
      </main>
    </div>
  )
}
