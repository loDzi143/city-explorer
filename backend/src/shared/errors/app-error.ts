export class AppError extends Error {
  readonly status: number
  readonly publicMessage: string

  constructor(message: string, status: number, publicMessage?: string) {
    super(message)
    this.name = "AppError"
    this.status = status
    this.publicMessage = publicMessage ?? message
  }
}
