import type { Lang } from "@/types/lang"

export type Theme = "light" | "dark"

export type User = {
  id: string
  username: string
}

export type AccountSettings = {
  language: Lang
  theme: Theme
}

export type Account = {
  user: User
  settings: AccountSettings
}

/** Where trips, messages and settings live: the browser (guest) or the server (account). */
export type StorageMode = "guest" | "account"
