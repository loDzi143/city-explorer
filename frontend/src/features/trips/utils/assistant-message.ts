export function assistantMessage(content: string) {
  const trimmed = content.trim()
  if (!trimmed.startsWith("{")) return content
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== "object" || !("message" in parsed)) return content
    const message = parsed.message
    return typeof message === "string" && message.trim() ? message : content
  } catch {
    return content
  }
}
