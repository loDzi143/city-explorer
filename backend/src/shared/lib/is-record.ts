/** A non-null object, for reading untyped JSON field by field. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
