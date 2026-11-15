// Mirrors the server rules so mistakes show up before the request; the server checks again.
const USERNAME = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

export type CredentialsError = "required" | "username" | "passwordShort" | "passwordLong" | "passwordMatch" | "passwordSame"

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

export function validateLogin(username: string, password: string): CredentialsError | null {
  return normalizeUsername(username) && password ? null : "required"
}

export function validateRegistration(username: string, password: string, confirm: string): CredentialsError | null {
  const name = normalizeUsername(username)
  if (!name || !password) return "required"
  if (name.length < 3 || name.length > 32 || !USERNAME.test(name)) return "username"
  if (password.length < 8) return "passwordShort"
  if (password.length > 128) return "passwordLong"
  if (password.toLowerCase() === name) return "passwordSame"
  if (password !== confirm) return "passwordMatch"
  return null
}
