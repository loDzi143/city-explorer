export const languages = ["en", "ru"] as const

export type Language = (typeof languages)[number]

export function isLanguage(value: string | null | undefined): value is Language {
  return value === "en" || value === "ru"
}
