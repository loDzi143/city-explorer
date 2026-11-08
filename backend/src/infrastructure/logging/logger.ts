export const logger = {
  error(error: unknown) {
    console.error(error instanceof Error ? error.message : error)
  },
}
