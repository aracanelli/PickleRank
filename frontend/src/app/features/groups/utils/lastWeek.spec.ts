import { describe, it, expect } from 'vitest'
import type { MatchHistoryEntryDto, RankingEntryDto } from '@/app/core/models/dto'
import { lastNight, nightForm, nightStats, myNight, chase } from './lastWeek'

const g = (eventId: string, date: string, round: number, court: number, t1: [string, string], t2: [string, string], s1: number, s2: number): MatchHistoryEntryDto => ({
  gameId: `${eventId}-${round}-${court}`, eventId, eventName: eventId, date, roundIndex: round, courtIndex: court,
  team1: t1.map(x => x.toUpperCase()), team2: t2.map(x => x.toUpperCase()), team1Ids: t1, team2Ids: t2,
  scoreTeam1: s1, scoreTeam2: s2, result: s1 > s2 ? 'TEAM1_WIN' : s2 > s1 ? 'TEAM2_WIN' : 'TIE'
})

const old = g('e1', '2026-10-27T19:00:00Z', 0, 0, ['a', 'b'], ['c', 'd'], 11, 0)
const night = [
  g('e2', '2026-11-03T19:00:00Z', 1, 0, ['a', 'c'], ['b', 'd'], 9, 11),
  g('e2', '2026-11-03T19:00:00Z', 0, 0, ['a', 'b'], ['c', 'd'], 11, 2),
  g('e2', '2026-11-03T19:00:00Z', 0, 1, ['e', 'f'], ['g', 'h'], 12, 10),
  { ...g('e2', '2026-11-03T19:00:00Z', 2, 0, ['a', 'd'], ['b', 'c'], 0, 0), result: 'UNSET', scoreTeam1: undefined, scoreTeam2: undefined }
]

describe('last week', () => {
  it('picks the newest event and orders its scored games by play order', () => {
    const n = lastNight([old, ...night])!
    expect(n.eventId).toBe('e2')
    expect(n.games.map(m => m.gameId)).toEqual(['e2-0-0', 'e2-0-1', 'e2-1-0'])
    expect(lastNight([])).toBeNull()
  })

  it('gives a player their results that night, first game first', () => {
    const n = lastNight([old, ...night])
    expect(nightForm(n, 'a')).toEqual(['W', 'L'])
    expect(nightForm(n, 'zz')).toEqual([])
  })

  it('counts the night', () => {
    const s = nightStats(lastNight([old, ...night]))!
    expect(s.games).toBe(3)
    expect(s.players).toBe(8)
    expect(s.points).toBe(55)
    expect(s.nailBiters).toBe(2)
    expect(s.closest?.gameId).toBe('e2-0-1')
    expect(s.blowout?.gameId).toBe('e2-0-0')
    expect(s.mvp).toMatchObject({ id: 'b', wins: 2, losses: 0, pointDiff: 11 })
    expect(s.perfect.map(p => p.id)).toEqual(['b'])
  })

  it('finds your night and best partner', () => {
    const m = myNight(lastNight(night), 'b')!
    expect(m.wins).toBe(2)
    expect(m.form).toEqual(['W', 'W'])
    expect(m.bestPartner?.name).toBe('A')
    expect(myNight(lastNight(night), 'nobody')).toBeNull()
  })

  it('chases the player above, or holds off the one below at #1', () => {
    const r = (rank: number, playerId: string, rating: number) => ({ rank, playerId, displayName: playerId, rating, gamesPlayed: 1, wins: 0, losses: 0, ties: 0, winRate: 0 }) as RankingEntryDto
    const rows = [r(1, 'x', 1100), r(2, 'y', 1080.4), r(3, 'z', 1000)]
    expect(chase(rows, 'z')).toEqual({ name: 'y', rank: 2, points: 81, leading: false })
    expect(chase(rows, 'x')).toEqual({ name: 'y', rank: 2, points: 20, leading: true })
    expect(chase(rows, 'nope')).toBeNull()
  })
})
