import { describe, it, expect } from 'vitest'
import type { RankingEntryDto } from '@/app/core/models/dto'
import { rankingRows, hasRecentChanges, ratingSystemLabel, winRatePct, signed } from './rankingsView'

const entry = (playerId: string, rating: number, rank: number): RankingEntryDto => ({
  rank, playerId, displayName: playerId, rating, gamesPlayed: 4, wins: 2, losses: 2, ties: 0, winRate: 0.5
})

const rankings = [entry('a', 1100, 1), entry('s', 1050, 2), entry('b', 1000, 3)]
const roster = [
  { id: 'gp_a', playerId: 'a', membershipType: 'PERMANENT' as const, ratingDelta: -80 },
  { id: 'gp_s', playerId: 's', membershipType: 'SUB' as const },
  { id: 'gp_b', playerId: 'b', membershipType: 'PERMANENT' as const, ratingDelta: 30 }
]

describe('rankingRows', () => {
  it('re-ranks regulars without subs and maps profile ids', () => {
    const rows = rankingRows(rankings, roster, 'permanent')
    expect(rows.map(r => [r.entry.playerId, r.rank, r.profileId])).toEqual([['a', 1, 'gp_a'], ['b', 2, 'gp_b']])
  })

  it('keeps subs in the everyone view and marks them', () => {
    const rows = rankingRows(rankings, roster, 'all')
    expect(rows.map(r => r.sub)).toEqual([false, true, false])
  })

  it('computes rank movement from rating minus last delta within the shown set', () => {
    // before: a 1180, s 1050, b 970 -> a1 s2 b3; now same order -> no movement
    expect(rankingRows(rankings, roster, 'all').map(r => r.rankChange)).toEqual([0, 0, 0])
    // b jumps: before b 900 vs a 1180
    const moved = rankingRows([entry('b', 1200, 1), entry('a', 1100, 2)], [{ id: 'x', playerId: 'b', membershipType: 'PERMANENT', ratingDelta: 300 }], 'all')
    expect(moved.map(r => r.rankChange)).toEqual([1, -1])
  })

  it('falls back to the ranking membership when the roster lacks the player', () => {
    const rows = rankingRows([{ ...entry('z', 900, 1), membershipType: 'SUB' }], [], 'permanent')
    expect(rows).toEqual([])
  })

  it('treats zero delta as no change', () => {
    expect(rankingRows([entry('a', 1, 1)], [{ id: 'g', playerId: 'a', membershipType: 'PERMANENT', ratingDelta: 0 }], 'all')[0].delta).toBeUndefined()
    expect(hasRecentChanges([{ id: 'g', playerId: 'a', membershipType: 'PERMANENT', ratingDelta: 0 }])).toBe(false)
    expect(hasRecentChanges(roster)).toBe(true)
  })
})

describe('formatting', () => {
  it('labels rating systems and numbers', () => {
    expect(ratingSystemLabel('CATCH_UP')).toBe('Catch-up')
    expect(ratingSystemLabel('RACS_ELO')).toBe("Rac's Elo")
    expect(ratingSystemLabel('SERIOUS_ELO')).toBe('Standard Elo')
    expect(ratingSystemLabel(undefined)).toBe('Standard Elo')
    expect(winRatePct(0.625)).toBe('63%')
    expect(signed(12.34)).toBe('+12.3')
    expect(signed(-2)).toBe('-2.0')
  })
})
