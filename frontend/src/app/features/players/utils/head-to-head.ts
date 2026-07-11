import type { MatchHistoryEntryDto } from '@/app/core/models/dto'
import { outcomeFor, sortNewestFirst, type Outcome } from '@/app/features/rankings/utils/match-derivations'

export interface H2HRecord {
  games: number
  wins: number
  losses: number
  ties: number
  winRate: number
  pointsFor: number
  pointsAgainst: number
  avgPointsFor: number
  avgPointsAgainst: number
  /** Current streak from the perspective player's side, e.g. W3. */
  streak: { type: Outcome; length: number } | null
  /** Last meetings, newest first (bounded). */
  lastMeetings: MatchHistoryEntryDto[]
}

/**
 * Head-to-head record computed from history entries where the two players
 * were OPPONENTS, from `groupPlayerId`'s perspective (a GROUP-PLAYER id).
 * Unscored games are ignored.
 */
export function computeH2H(
  matches: MatchHistoryEntryDto[],
  groupPlayerId: string,
  meetingsLimit = 5
): H2HRecord {
  const ordered = sortNewestFirst(matches).filter(
    (m) => outcomeFor(m, groupPlayerId) !== null
  )

  let wins = 0
  let losses = 0
  let ties = 0
  let pointsFor = 0
  let pointsAgainst = 0

  for (const match of ordered) {
    const outcome = outcomeFor(match, groupPlayerId)!
    if (outcome === 'W') wins++
    else if (outcome === 'L') losses++
    else ties++

    const onTeam1 = match.team1Ids?.includes(groupPlayerId)
    const own = onTeam1 ? match.scoreTeam1 : match.scoreTeam2
    const opp = onTeam1 ? match.scoreTeam2 : match.scoreTeam1
    if (own != null && opp != null) {
      pointsFor += own
      pointsAgainst += opp
    }
  }

  const games = wins + losses + ties

  // Current streak within this matchup
  let streak: H2HRecord['streak'] = null
  for (const match of ordered) {
    const outcome = outcomeFor(match, groupPlayerId)!
    if (!streak) {
      streak = { type: outcome, length: 1 }
    } else if (streak.type === outcome) {
      streak.length++
    } else {
      break
    }
  }

  return {
    games,
    wins,
    losses,
    ties,
    winRate: games > 0 ? (wins + 0.5 * ties) / games : 0,
    pointsFor,
    pointsAgainst,
    avgPointsFor: games > 0 ? pointsFor / games : 0,
    avgPointsAgainst: games > 0 ? pointsAgainst / games : 0,
    streak: games > 0 ? streak : null,
    lastMeetings: ordered.slice(0, meetingsLimit)
  }
}
