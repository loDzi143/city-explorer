import { QueryClientProvider } from "@tanstack/react-query"
import { useEffect, type ReactNode } from "react"

import { queryClient } from "@/lib/query-client"
import { useChatStore } from "@/stores/chat-store"

function DocumentPreferences() {
  const hydrated = useChatStore((state) => state.hasHydrated)
  const lang = useChatStore((state) => state.lang)
  const dark = useChatStore((state) => state.dark)
  const followSystemLang = useChatStore((state) => state.followSystemLang)
  const followSystemDark = useChatStore((state) => state.followSystemDark)

  useEffect(() => {
    if (!hydrated) return
    document.documentElement.classList.toggle("dark", dark)
    document.documentElement.lang = lang
  }, [hydrated, dark, lang])

  useEffect(() => {
    if (!hydrated) return
    const apply = () => followSystemLang()
    apply()
    window.addEventListener("languagechange", apply)
    return () => window.removeEventListener("languagechange", apply)
  }, [hydrated, followSystemLang])

  useEffect(() => {
    if (!hydrated) return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => followSystemDark()
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [hydrated, followSystemDark])

  return null
}

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DocumentPreferences />
      {children}
    </QueryClientProvider>
  )
}
