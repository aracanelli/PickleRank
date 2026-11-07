import type { RatingHistoryPoint } from '@/app/core/models/dto'

export interface SeriesPoint {
  label: string
  title: string
  rating: number
  delta: number
  eventId?: string
  start?: boolean
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/**
 * Oldest first, with a synthetic starting point (first rating minus its change)
 * so the line shows where the player began.
 */
export function ratingSeries(history: readonly RatingHistoryPoint[]): SeriesPoint[] {
  if (!history.length) return []
  const sorted = [...history].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const first = sorted[0]
  const out: SeriesPoint[] = [{ label: 'Start', title: 'Start', rating: first.rating - (first.delta ?? 0), delta: 0, start: true }]
  for (const h of sorted) {
    const d = day(h.createdAt)
    out.push({ label: d, title: h.eventName ? `${h.eventName}, ${d}` : d, rating: h.rating, delta: h.delta ?? 0, eventId: h.eventId })
  }
  return out
}

/** "+12.3", "−4.0", "0.0" */
export function signed(n: number): string {
  const v = Math.abs(n).toFixed(1)
  if (v === '0.0') return '0.0'
  return n > 0 ? `+${v}` : `−${v}`
}
