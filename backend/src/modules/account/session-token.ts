import { createHash, randomBytes } from "node:crypto"

/** 256 bits from the OS CSPRNG, base64url for the cookie. */
export function generateSessionToken() {
  return randomBytes(32).toString("base64url")
}

/**
 * Only this digest is stored. The token already has 256 bits of entropy, so a fast hash is enough:
 * a leaked sessions table can't be turned back into usable cookies.
 */
export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}
