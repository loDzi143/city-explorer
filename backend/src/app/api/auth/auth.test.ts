import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createBrowser } from "@/app/api/_lib/testing"
import { POST as login } from "@/app/api/auth/login/route"
import { POST as logout } from "@/app/api/auth/logout/route"
import { GET as me } from "@/app/api/auth/me/route"
import { POST as register } from "@/app/api/auth/register/route"
import { DELETE as revokeSessions } from "@/app/api/auth/sessions/route"
import { GET as getSettings, PATCH as patchSettings } from "@/app/api/account/settings/route"
import { schema } from "@/infrastructure/database/client"
import { createTestDatabase } from "@/infrastructure/database/testing"
import { hashSessionToken } from "@/modules/account/session-token"

type Account = { user: { id: string; username: string }; settings: { language: string; theme: string } }
type ApiError = { error: string; code: string }

let database: Awaited<ReturnType<typeof createTestDatabase>>

beforeAll(async () => {
  database = await createTestDatabase()
})

afterAll(async () => {
  await database.close()
})

beforeEach(async () => {
  await database.reset()
})

async function signUp(username = "traveller", password = "correct horse 1") {
  const browser = createBrowser()
  const result = await browser.call<Account>(register, { body: { username, password } })
  expect(result.status).toBe(201)
  return { browser, result }
}

describe("registration", () => {
  it("creates the account, default settings and a session cookie", async () => {
    const { browser, result } = await signUp("Traveller")

    expect(result.body.user.username).toBe("traveller")
    expect(result.body.settings).toEqual({ language: "en", theme: "light" })

    const cookie = result.setCookies[0] ?? ""
    expect(cookie).toMatch(/^ce_session=[A-Za-z0-9_-]{43};/)
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Lax")
    expect(cookie).toContain("Path=/")
    expect(cookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`)

    const [user] = await database.db.select().from(schema.users)
    expect(user.passwordHash).toMatch(/^\$argon2id\$/)
    expect(user.passwordHash).not.toContain("correct horse")

    // Only the token hash is stored.
    const token = browser.cookie("ce_session") ?? ""
    const [session] = await database.db.select().from(schema.sessions)
    expect(session.tokenHash).toBe(hashSessionToken(token))
    expect(session.tokenHash).not.toBe(token)
  })

  it("stores the settings chosen as a guest", async () => {
    const browser = createBrowser()
    const result = await browser.call<Account>(register, {
      body: { username: "maria", password: "long enough 42", settings: { language: "ru", theme: "dark" } },
    })
    expect(result.status).toBe(201)
    expect(result.body.settings).toEqual({ language: "ru", theme: "dark" })
  })

  it("rejects a taken username regardless of case", async () => {
    await signUp("traveller")
    const result = await createBrowser().call<ApiError>(register, { body: { username: "TRAVELLER", password: "another pass 1" } })
    expect(result.status).toBe(409)
    expect(result.body.code).toBe("username_taken")
    expect(await database.db.select().from(schema.users)).toHaveLength(1)
  })

  it.each([
    [{ username: "ab", password: "long enough 1" }, "at least 3"],
    [{ username: "bad name", password: "long enough 1" }, "latin letters"],
    [{ username: "robert'); DROP TABLE users;--", password: "long enough 1" }, "latin letters"],
    [{ username: "valid", password: "short" }, "at least 8"],
    [{ username: "samevalue", password: "SameValue" }, "differ"],
    [{ username: "valid" }, ""],
  ])("validates %j", async (body, message) => {
    const result = await createBrowser().call<ApiError>(register, { body })
    expect(result.status).toBe(400)
    expect(result.body.code).toBe("validation_error")
    expect(result.body.error).toContain(message)
    expect(await database.db.select().from(schema.users)).toHaveLength(0)
  })
})

describe("login", () => {
  it("signs in with the right password and opens a new session", async () => {
    await signUp("traveller", "correct horse 1")
    const browser = createBrowser()
    const result = await browser.call<Account>(login, { body: { username: " Traveller ", password: "correct horse 1" } })

    expect(result.status).toBe(200)
    expect(result.body.user.username).toBe("traveller")
    expect(browser.cookie("ce_session")).toBeTruthy()
    expect(await database.db.select().from(schema.sessions)).toHaveLength(2)
  })

  it("gives the same neutral answer for a wrong password and an unknown user", async () => {
    await signUp("traveller", "correct horse 1")
    const wrongPassword = await createBrowser().call<ApiError>(login, { body: { username: "traveller", password: "wrong password" } })
    const unknownUser = await createBrowser().call<ApiError>(login, { body: { username: "nobody", password: "wrong password" } })

    expect(wrongPassword.status).toBe(401)
    expect(unknownUser.status).toBe(401)
    expect(wrongPassword.body).toEqual(unknownUser.body)
    expect(wrongPassword.body).toEqual({ error: "Invalid username or password", code: "invalid_credentials" })
    expect(wrongPassword.setCookies).toHaveLength(0)
  })

  it("limits repeated attempts for one username", async () => {
    await signUp("target", "correct horse 1")
    const statuses: number[] = []
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await createBrowser().call(login, { body: { username: "target", password: `guess ${attempt}` } })).status)
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true)
    const limited = await createBrowser().call<ApiError>(login, { body: { username: "target", password: "correct horse 1" } })
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/)
  })
})

describe("session", () => {
  it("returns the current user for a valid session and 401 without one", async () => {
    const { browser } = await signUp("traveller")
    const current = await browser.call<Account>(me)
    expect(current.status).toBe(200)
    expect(current.body.user.username).toBe("traveller")

    const guest = await createBrowser().call<ApiError>(me)
    expect(guest.status).toBe(401)
    expect(guest.body.code).toBe("unauthorized")
  })

  it("rejects a forged token", async () => {
    const browser = createBrowser()
    browser.setCookie("ce_session", "A".repeat(43))
    expect((await browser.call(me)).status).toBe(401)
  })

  it("logs out: deletes the session and clears the cookie", async () => {
    const { browser } = await signUp("traveller")
    const token = browser.cookie("ce_session") ?? ""

    const result = await browser.call(logout, { method: "POST" })
    expect(result.status).toBe(204)
    expect(result.setCookies[0]).toContain("Max-Age=0")
    expect(await database.db.select().from(schema.sessions)).toHaveLength(0)

    // The old token is useless even if it was copied before logout.
    const replay = createBrowser()
    replay.setCookie("ce_session", token)
    expect((await replay.call(me)).status).toBe(401)
  })

  it("does not accept an expired session and removes it", async () => {
    const { browser } = await signUp("traveller")
    await database.db.update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) })

    const result = await browser.call<ApiError>(me)
    expect(result.status).toBe(401)
    expect(result.setCookies[0]).toContain("Max-Age=0")
    expect(await database.db.select().from(schema.sessions)).toHaveLength(0)
  })

  it("extends an active session and re-sends the cookie", async () => {
    const { browser } = await signUp("traveller")
    const soon = new Date(Date.now() + 60_000)
    await database.db.update(schema.sessions).set({ lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000), expiresAt: soon })

    const result = await browser.call(me)
    expect(result.status).toBe(200)
    expect(result.setCookies[0]).toContain(`Max-Age=${30 * 24 * 60 * 60}`)
    const [session] = await database.db.select().from(schema.sessions)
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000)
  })

  it("revokes every session of the user", async () => {
    const { browser } = await signUp("traveller", "correct horse 1")
    const other = createBrowser()
    await other.call(login, { body: { username: "traveller", password: "correct horse 1" } })

    expect((await browser.call(revokeSessions, { method: "DELETE" })).status).toBe(204)
    expect((await browser.call(me)).status).toBe(401)
    expect((await other.call(me)).status).toBe(401)
  })
})

describe("account settings", () => {
  it("reads and updates language and theme", async () => {
    const { browser, result } = await signUp("traveller")
    const updated = await browser.call(patchSettings, { method: "PATCH", body: { theme: "dark" } })
    expect(updated.body).toEqual({ language: "en", theme: "dark" })
    expect((await browser.call(getSettings)).body).toEqual({ language: "en", theme: "dark" })

    const [row] = await database.db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, result.body.user.id))
    expect(row.theme).toBe("dark")
  })

  it("rejects unsupported values", async () => {
    const { browser } = await signUp("traveller")
    expect((await browser.call(patchSettings, { method: "PATCH", body: { language: "de" } })).status).toBe(400)
    expect((await browser.call(patchSettings, { method: "PATCH", body: {} })).status).toBe(400)
  })

  it("requires a session", async () => {
    expect((await createBrowser().call(getSettings)).status).toBe(401)
  })
})

describe("CSRF and CORS", () => {
  it("rejects state-changing requests from other origins or without an origin", async () => {
    const { browser } = await signUp("traveller")
    const evil = await browser.call<ApiError>(patchSettings, { method: "PATCH", body: { theme: "dark" }, origin: "https://evil.example" })
    expect(evil.status).toBe(403)
    expect(evil.body.code).toBe("forbidden_origin")
    expect((await browser.call(patchSettings, { method: "PATCH", body: { theme: "dark" }, origin: null })).status).toBe(403)
    expect((await browser.call(logout, { method: "POST", origin: "https://evil.example" })).status).toBe(403)
  })

  it("rejects form-encodable content types", async () => {
    const { browser } = await signUp("traveller")
    const result = await browser.call(patchSettings, {
      method: "PATCH",
      body: JSON.stringify({ theme: "dark" }),
      headers: { "content-type": "text/plain" },
    })
    expect(result.status).toBe(415)
  })

  it("allows credentials only for a specific origin", async () => {
    const result = await createBrowser().call(me)
    expect(result.headers.get("access-control-allow-origin")).toBe("http://localhost:5173")
    expect(result.headers.get("access-control-allow-credentials")).toBe("true")

    const foreign = await createBrowser().call(me, { origin: "https://evil.example" })
    expect(foreign.headers.get("access-control-allow-origin")).not.toBe("https://evil.example")
    expect(foreign.headers.get("access-control-allow-origin")).not.toBe("*")
  })
})
