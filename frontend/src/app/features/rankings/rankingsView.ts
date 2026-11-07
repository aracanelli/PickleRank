import type { RankingEntryDto, GroupPlayerDto } from '@/app/core/models/dto'

export type RankingFilter = 'permanent' | 'all'

export interface RankingRow {
  entry: RankingEntryDto
  /** Rank within the shown list (regulars-only view re-ranks without subs). */
  rank: number
  sub: boolean
  /** Rating change from the last completed event, when the roster reports one. */
  delta?: number
  /** Places moved since before the last event: positive is up. */
  rankChange: number
  /** Group player id for the profile route. */
  profileId?: string
}

type RosterBits = Pick<GroupPlayerDto, 'id' | 'playerId' | 'membershipType' | 'ratingDelta'>

/**
 * Rankings as shown on the rankings screen. Previous rank is rating minus last delta,
 * ranked within the same filtered set so movement is relative to what is on screen.
 */
export function rankingRows(rankings: RankingEntryDto[], roster: RosterBits[], filter: RankingFilter): RankingRow[] {
  const byPlayer = new Map(roster.map(p => [p.playerId, p]))
  const membership = (r: RankingEntryDto) => byPlayer.get(r.playerId)?.membershipType ?? r.membershipType
  const shown = filter === 'all' ? rankings : rankings.filter(r => membership(r) !== 'SUB')

  const previous = new Map(
    shown
      .map(r => ({ id: r.playerId, before: r.rating - (byPlayer.get(r.playerId)?.ratingDelta ?? 0) }))
      .sort((a, b) => b.before - a.before)
      .map((p, i) => [p.id, i + 1])
  )

  return shown.map((entry, i) => {
    const p = byPlayer.get(entry.playerId)
    return {
      entry,
      rank: i + 1,
      sub: membership(entry) === 'SUB',
      delta: p?.ratingDelta || undefined,
      rankChange: (previous.get(entry.playerId) ?? i + 1) - (i + 1),
      profileId: p?.id
    }
  })
}

export const hasRecentChanges = (roster: RosterBits[]) => roster.some(p => !!p.ratingDelta)

export { ratingSystemLabel } from '@/app/features/groups/ratingSystems'

export const winRatePct = (winRate: number) => `${Math.round(winRate * 100)}%`

export const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`
