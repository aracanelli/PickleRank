/** Maps API failures to a user-facing message. Backend errors are `{detail}`. */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error && typeof error === 'object') {
    const err = error as { status?: number; message?: string; detail?: string }
    if (err.status === 429) return 'Rate limited — please wait a moment and try again'
    if (err.status === 403) return "You don't have permission to do that"
    const detail = err.detail || err.message
    if (detail && typeof detail === 'string') return detail
  }
  if (typeof error === 'string') return error
  return fallback
}
