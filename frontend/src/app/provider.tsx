import { QueryClientProvider } from "@tanstack/react-query"
import { useEffect, type ReactNode } from "react"

import { queryClient } from "@/lib/query-client"
import { useChatStore } from "@/stores/chat-store"

function DocumentPreferences() {
  const hydrated = useChatStore((state) => state.hasHydrated)
  const lang = useChatStore((state) => state.lang)
  const dark = useChatStore((state) => state.dark)

  useEffect(() => {
    if (!hydrated) return
    document.documentElement.classList.toggle("dark", dark)
    document.documentElement.lang = lang
  }, [hydrated, dark, lang])

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
