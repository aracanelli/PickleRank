import type { MatchHistoryEntryDto } from '@/app/core/models/dto'
import { outcomeFor, sortNewestFirst, type Outcome } from '@/app/features/rankings/utils/match-derivations'

/**
 * Last-N results for a player, newest first (reading order: most recent on
 * the left). `groupPlayerId` is the GROUP-PLAYER id (history team ids).
 * Unscored games are skipped.
 */
export function computeFormGuide(
  matches: MatchHistoryEntryDto[],
  groupPlayerId: string,
  n = 5
): Outcome[] {
  const results: Outcome[] = []
  for (const match of sortNewestFirst(matches)) {
    const outcome = outcomeFor(match, groupPlayerId)
    if (outcome === null) continue
    results.push(outcome)
    if (results.length >= n) break
  }
  return results
}
