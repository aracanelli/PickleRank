import type { MatchHistoryEntryDto } from '@/app/core/models/dto'

// Pure derivations over match-history entries. IMPORTANT ID SEMANTICS:
// `team1Ids`/`team2Ids` on history entries are GROUP-PLAYER ids — callers
// pass group-player ids here (map from global playerId via usePlayerIndex).

export type Outcome = 'W' | 'L' | 'T'

/** Outcome of a match from one player's perspective; null if they didn't play
 *  or the game is unscored. */
export function outcomeFor(match: MatchHistoryEntryDto, groupPlayerId: string): Outcome | null {
  const onTeam1 = match.team1Ids?.includes(groupPlayerId)
  const onTeam2 = match.team2Ids?.includes(groupPlayerId)
  if (!onTeam1 && !onTeam2) return null
  if (match.result === 'TIE') return 'T'
  if (match.result === 'TEAM1_WIN') return onTeam1 ? 'W' : 'L'
  if (match.result === 'TEAM2_WIN') return onTeam2 ? 'W' : 'L'
  return null
}

/** Matches sorted newest-first (stable for equal dates). */
export function sortNewestFirst(matches: MatchHistoryEntryDto[]): MatchHistoryEntryDto[] {
  return [...matches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export interface Streak {
  groupPlayerId: string
  displayName: string
  type: 'W' | 'L'
  length: number
}

/** Current streak (consecutive most-recent same outcomes, ties break it). */
export function currentStreak(
  matches: MatchHistoryEntryDto[],
  groupPlayerId: string
): { type: Outcome; length: number } | null {
  const ordered = sortNewestFirst(matches)
  let type: Outcome | null = null
  let length = 0
  for (const match of ordered) {
    const outcome = outcomeFor(match, groupPlayerId)
    if (outcome === null) continue
    if (type === null) {
      type = outcome
      length = 1
    } else if (outcome === type) {
      length++
    } else {
      break
    }
  }
  return type ? { type, length } : null
}

/**
 * Hottest (longest current W) and coldest (longest current L) players.
 * `players` maps group-player id -> display name; minimum streak length 2
 * so a single result doesn't read as a "streak".
 */
export function hotAndCold(
  matches: MatchHistoryEntryDto[],
  players: Map<string, string>,
  minLength = 2
): { hot: Streak | null; cold: Streak | null } {
  let hot: Streak | null = null
  let cold: Streak | null = null
  for (const [groupPlayerId, displayName] of players) {
    const streak = currentStreak(matches, groupPlayerId)
    if (!streak || streak.length < minLength || streak.type === 'T') continue
    if (streak.type === 'W' && (!hot || streak.length > hot.length)) {
      hot = { groupPlayerId, displayName, type: 'W', length: streak.length }
    }
    if (streak.type === 'L' && (!cold || streak.length > cold.length)) {
      cold = { groupPlayerId, displayName, type: 'L', length: streak.length }
    }
  }
  return { hot, cold }
}

export interface EventGroup {
  eventId: string
  eventName?: string
  date: string
  matches: MatchHistoryEntryDto[]
}

/** Group matches by event, newest event first. */
export function groupByEvent(matches: MatchHistoryEntryDto[]): EventGroup[] {
  const groups = new Map<string, EventGroup>()
  for (const match of sortNewestFirst(matches)) {
    let group = groups.get(match.eventId)
    if (!group) {
      group = { eventId: match.eventId, eventName: match.eventName, date: match.date, matches: [] }
      groups.set(match.eventId, group)
    }
    group.matches.push(match)
  }
  return [...groups.values()]
}
