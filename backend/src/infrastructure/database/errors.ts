/** PostgreSQL unique_violation (23505), optionally for one constraint. Drizzle wraps driver errors, so causes are checked too. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const { code, constraint: name } = current as { code?: unknown; constraint?: unknown }
    if (code === "23505") return constraint === undefined || name === constraint || String((current as Error).message ?? "").includes(constraint)
    current = (current as { cause?: unknown }).cause
  }
  return false
}
