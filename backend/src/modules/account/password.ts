import { hash, verify, type Algorithm } from "@node-rs/argon2"

// OWASP minimum for Argon2id: 19 MiB memory, 2 iterations, 1 lane.
// `Algorithm` is an ambient const enum, which isolatedModules can't inline; 2 is Algorithm.Argon2id.
const ARGON2ID = 2 as Algorithm

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export function hashPassword(password: string) {
  return hash(password, OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password)
  } catch {
    // A malformed stored hash is a failed check, not a crash.
    return false
  }
}

let dummyHash: Promise<string> | null = null

/**
 * Runs a full Argon2 verification against a throwaway hash so a login for an unknown
 * username takes as long as one for an existing username.
 */
export async function verifyDummyPassword(password: string) {
  dummyHash ??= hash("city-explorer-timing-equalizer", OPTIONS)
  await verifyPassword(await dummyHash, password)
  return false
}
