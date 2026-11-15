import { AppError } from "@/shared/errors/app-error"

// Drizzle puts the SQL parameters (password hashes, token hashes, message text) into the error message
// after "params:"; they must never reach the log.
const PARAMS_MARKER = /\nparams:[\s\S]*$/
const STACK_FRAMES = 8

function message(error: Error) {
  return error.message.replace(PARAMS_MARKER, "")
}

/** Where an unexpected error was thrown. Only the frames: the stack's first lines repeat the message. */
function frames(error: Error) {
  const lines = (error.stack ?? "").split("\n").filter((line) => /^\s+at /.test(line))
  return lines.length > 0 ? `\n${lines.slice(0, STACK_FRAMES).join("\n")}` : ""
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return typeof error === "string" ? error : "Unknown error"
  const cause = error.cause instanceof Error ? ` (cause: ${message(error.cause)})` : ""
  // An AppError is an expected failure that names itself; anything else is a bug and needs its origin.
  return `${message(error)}${cause}${error instanceof AppError ? "" : frames(error)}`
}

export const logger = {
  error(error: unknown) {
    console.error(describe(error))
  },
  /** A recovered problem worth seeing in the log, e.g. a retried upstream call. */
  warn(message: string, error?: unknown) {
    console.warn(error === undefined ? message : `${message}: ${describe(error)}`)
  },
}
