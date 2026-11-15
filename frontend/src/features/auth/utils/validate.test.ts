import { describe, expect, it } from "vitest"

import { validateLogin, validateRegistration } from "./validate"

describe("credentials validation", () => {
  it("accepts valid registration data", () => {
    expect(validateRegistration(" Traveller ", "long enough 1", "long enough 1")).toBeNull()
  })

  it.each([
    ["", "long enough 1", "long enough 1", "required"],
    ["ab", "long enough 1", "long enough 1", "username"],
    ["bad name", "long enough 1", "long enough 1", "username"],
    ["-dash", "long enough 1", "long enough 1", "username"],
    ["valid", "short", "short", "passwordShort"],
    ["valid", "x".repeat(129), "x".repeat(129), "passwordLong"],
    ["samevalue", "SameValue", "SameValue", "passwordSame"],
    ["valid", "long enough 1", "long enough 2", "passwordMatch"],
  ])("rejects %j / %j", (username, password, confirm, error) => {
    expect(validateRegistration(username, password, confirm)).toBe(error)
  })

  it("only requires both fields for login", () => {
    expect(validateLogin("any", "x")).toBeNull()
    expect(validateLogin("  ", "x")).toBe("required")
  })
})
