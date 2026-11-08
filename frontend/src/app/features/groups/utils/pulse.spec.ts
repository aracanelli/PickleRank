import { describe, it, expect } from 'vitest'
import type { MatchHistoryEntryDto, RankingEntryDto } from '@/app/core/models/dto'
import { rivalry, dynamicDuo, milestones, gameOfTheWeek, formFor } from './pulse'

let n = 0
function game(t1: string[], t2: string[], s1: number | null, s2: number | null, date = '2026-11-01'): MatchHistoryEntryDto {
  const result = s1 == null || s2 == null ? 'UNSET' : s1 > s2 ? 'TEAM1_WIN' : s2 > s1 ? 'TEAM2_WIN' : 'TIE'
  return {
    gameId: `g${++n}`, eventId: 'e1', date, roundIndex: 0, courtIndex: 0,
    team1: t1, team2: t2, team1Ids: t1, team2Ids: t2,
    scoreTeam1: s1 ?? undefined, scoreTeam2: s2 ?? undefined, result
  }
}
const rank = (playerId: string, gamesPlayed: number) =>
  ({ rank: 1, playerId, displayName: playerId, rating: 1000, gamesPlayed, wins: 0, losses: 0, ties: 0, winRate: 0 }) as RankingEntryDto

describe('rivalry', () => {
  it('picks the most-met close pair and ignores lopsided ones', () => {
    const ms = [
      game(['a', 'x'], ['b', 'y'], 11, 5),
      game(['b', 'x'], ['a', 'y'], 11, 9),
      game(['a', 'z'], ['b', 'w'], 11, 7),
      game(['b', 'z'], ['a', 'w'], 11, 8),
      // c beats d every time: not a rivalry
      game(['c', 'q'], ['d', 'r'], 11, 1),
      game(['c', 'q'], ['d', 'r'], 11, 1),
      game(['c', 'q'], ['d', 'r'], 11, 1),
      game(['c', 'q'], ['d', 'r'], 11, 1),
      game(['c', 'q'], ['d', 'r'], 11, 1)
    ]
    expect(rivalry(ms)).toEqual({ a: 'a', b: 'b', aWins: 2, bWins: 2, ties: 0, meetings: 4 })
  })
  it('returns null with too few meetings or unscored games', () => {
    expect(rivalry([game(['a'], ['b'], 11, 9), game(['a'], ['b'], null, null)])).toBeNull()
  })
})

describe('dynamicDuo', () => {
  it('needs min games and a winning record, prefers higher rate', () => {
    const ms = [
      game(['a', 'b'], ['c', 'd'], 11, 3),
      game(['a', 'b'], ['e', 'f'], 11, 3),
      game(['a', 'b'], ['c', 'd'], 3, 11),
      game(['e', 'f'], ['a', 'c'], 11, 3),
      game(['e', 'f'], ['a', 'c'], 11, 3),
      game(['e', 'f'], ['b', 'd'], 11, 3)
    ]
    expect(dynamicDuo(ms)).toEqual({ a: 'e', b: 'f', wins: 3, games: 4 })
    expect(dynamicDuo(ms.slice(0, 2))).toBeNull()
  })
})

describe('milestones', () => {
  it('finds players near round numbers, closest first', () => {
    const out = milestones([rank('p1', 48), rank('p2', 25), rank('p3', 40), rank('p4', 249)])
    expect(out.map(m => [m.playerId, m.target, m.toGo])).toEqual([['p2', 25, 0], ['p4', 250, 1]])
  })
})

describe('gameOfTheWeek', () => {
  it('picks the closest high-scoring game within a week of the newest', () => {
    const old = game(['a'], ['b'], 15, 14, '2026-10-01')
    const close = game(['a'], ['b'], 11, 9, '2026-11-01')
    const closer = game(['c'], ['d'], 12, 10, '2026-10-30')
    const blowout = game(['c'], ['d'], 11, 2, '2026-11-01')
    expect(gameOfTheWeek([old, close, closer, blowout])).toBe(closer)
    expect(gameOfTheWeek([blowout])).toBeNull()
    expect(gameOfTheWeek([])).toBeNull()
  })
})

describe('formFor', () => {
  it('lists the newest results first, skipping games the player missed', () => {
    const ms = [
      game(['a'], ['b'], 11, 3, '2026-11-01'),
      game(['a'], ['b'], 3, 11, '2026-11-03'),
      game(['c'], ['b'], 3, 11, '2026-11-04'),
      game(['b'], ['a'], 5, 5, '2026-11-05')
    ]
    expect(formFor(ms, 'a')).toEqual(['T', 'L', 'W'])
    expect(formFor(ms, 'a', 2)).toEqual(['T', 'L'])
  })
})
