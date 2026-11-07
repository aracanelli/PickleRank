import type { MatchHistoryEntryDto } from '@/app/core/models/dto'

export type Relationship = 'teammate' | 'opponent'

/** History filters. The URL query is the source of truth so links (and "Correct scores") land pre-filtered. */
export interface HistoryFilters {
  eventId: string
  playerId: string
  secondaryPlayerId: string
  relationship: Relationship
  /** Inclusive date range, yyyy-mm-dd. */
  from: string
  to: string
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function filtersFromQuery(q: Record<string, unknown>): HistoryFilters {
  const playerId = str(q.playerId)
  return {
    eventId: str(q.eventId),
    playerId,
    // a second player only means something next to a first one
    secondaryPlayerId: playerId ? str(q.secondaryPlayerId) : '',
    relationship: q.relationship === 'opponent' ? 'opponent' : 'teammate',
    from: str(q.from),
    to: str(q.to)
  }
}

/** Query to write back to the URL: empty values dropped, relationship only with a second player. */
export function filtersToQuery(f: HistoryFilters): Record<string, string> {
  const q: Record<string, string> = {}
  if (f.eventId) q.eventId = f.eventId
  if (f.playerId) q.playerId = f.playerId
  if (f.playerId && f.secondaryPlayerId && f.secondaryPlayerId !== f.playerId) {
    q.secondaryPlayerId = f.secondaryPlayerId
    q.relationship = f.relationship
  }
  if (f.from) q.from = f.from
  if (f.to) q.to = f.to
  return q
}

/** Options for rankingsApi.getHistory. */
export function historyOptions(f: HistoryFilters) {
  const q = filtersToQuery(f)
  return {
    eventId: q.eventId,
    playerId: q.playerId,
    secondaryPlayerId: q.secondaryPlayerId,
    relationship: q.relationship as Relationship | undefined,
    from: q.from,
    to: q.to
  }
}

export const hasFilters = (f: HistoryFilters) => !!(f.eventId || f.playerId || f.from || f.to)

export interface EventGroup {
  id: string
  name?: string
  date: string
  matches: MatchHistoryEntryDto[]
}

/** Games grouped by event, newest event first, games in round then court order. */
export function groupByEvent(matches: MatchHistoryEntryDto[]): EventGroup[] {
  const map = new Map<string, EventGroup>()
  for (const m of matches) {
    let g = map.get(m.eventId)
    if (!g) map.set(m.eventId, (g = { id: m.eventId, name: m.eventName, date: m.date, matches: [] }))
    g.matches.push(m)
  }
  const groups = [...map.values()]
  for (const g of groups) g.matches.sort((a, b) => a.roundIndex - b.roundIndex || a.courtIndex - b.courtIndex)
  return groups.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

/**
 * Win, loss or tie for the filtered player, when they played in the game and it has a result.
 * Matched by display name: team ids in history are not guaranteed to be the global player id.
 */
export function outcomeFor(m: MatchHistoryEntryDto, playerName: string): 'won' | 'lost' | 'tied' | null {
  if (!playerName) return null
  const side = m.team1.includes(playerName) ? 1 : m.team2.includes(playerName) ? 2 : 0
  if (!side) return null
  if (m.result === 'TIE') return 'tied'
  if (m.result === 'TEAM1_WIN') return side === 1 ? 'won' : 'lost'
  if (m.result === 'TEAM2_WIN') return side === 2 ? 'won' : 'lost'
  return null
}
