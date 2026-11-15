import { z } from "zod"

import { languages } from "@/shared/types/language"

import { themes, type AccountSettings, type Credentials, type RegisterInput } from "./account.types"

export const USERNAME_MIN = 3
export const USERNAME_MAX = 32
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

/** Lowercase latin letters, digits and . _ - ; starts and ends with a letter or digit. */
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters`)
      .max(USERNAME_MAX, `Username must be at most ${USERNAME_MAX} characters`)
      .regex(USERNAME_PATTERN, "Username may contain only latin letters, digits, dots, hyphens and underscores"),
  )

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`)
  .refine((value) => value.trim().length > 0, "Password must not be blank")

const settingsSchema = z.object({
  language: z.enum(languages),
  theme: z.enum(themes),
})

const registerSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    settings: settingsSchema.partial().optional(),
  })
  .refine((value) => value.password.toLowerCase() !== value.username, {
    message: "Password must differ from the username",
    path: ["password"],
  })

// Login only bounds the input: format rules must not tell an attacker which usernames are impossible.
const loginSchema = z.object({
  username: z.string().max(200).transform(normalizeUsername),
  password: z.string().max(PASSWORD_MAX * 4),
})

const settingsPatchSchema = settingsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update")

type Parsed<T> = { ok: true; data: T } | { ok: false; error: string }

function firstIssue(error: z.ZodError, fallback: string) {
  return error.issues[0]?.message || fallback
}

export function parseRegisterBody(payload: unknown): Parsed<RegisterInput> {
  const result = registerSchema.safeParse(payload)
  if (!result.success) return { ok: false, error: firstIssue(result.error, "Invalid registration data") }
  return { ok: true, data: result.data }
}

export function parseLoginBody(payload: unknown): Parsed<Credentials> {
  const result = loginSchema.safeParse(payload)
  if (!result.success) return { ok: false, error: "Username and password are required" }
  return { ok: true, data: result.data }
}

export function parseSettingsPatch(payload: unknown): Parsed<Partial<AccountSettings>> {
  const result = settingsPatchSchema.safeParse(payload)
  if (!result.success) return { ok: false, error: "Invalid settings" }
  return { ok: true, data: result.data }
}
