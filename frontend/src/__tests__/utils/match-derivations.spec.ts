import { describe, it, expect } from 'vitest'
import type { MatchHistoryEntryDto } from '@/app/core/models/dto'
import {
  outcomeFor,
  currentStreak,
  hotAndCold,
  groupByEvent
} from '@/app/features/rankings/utils/match-derivations'
import { computeFormGuide } from '@/app/features/players/utils/form-guide'
import { computeH2H } from '@/app/features/players/utils/head-to-head'

let seq = 0
function match(overrides: Partial<MatchHistoryEntryDto>): MatchHistoryEntryDto {
  seq++
  return {
    gameId: `g${seq}`,
    eventId: overrides.eventId ?? `e${seq}`,
    date: overrides.date ?? `2026-07-${String(seq).padStart(2, '0')}T19:00:00Z`,
    roundIndex: 0,
    courtIndex: 0,
    team1: ['A', 'B'],
    team2: ['C', 'D'],
    team1Ids: ['a', 'b'],
    team2Ids: ['c', 'd'],
    scoreTeam1: 11,
    scoreTeam2: 7,
    result: 'TEAM1_WIN',
    ...overrides
  }
}

describe('outcomeFor', () => {
  it('resolves W/L/T from the player perspective', () => {
    const m = match({ result: 'TEAM1_WIN' })
    expect(outcomeFor(m, 'a')).toBe('W')
    expect(outcomeFor(m, 'c')).toBe('L')
    expect(outcomeFor(match({ result: 'TIE' }), 'a')).toBe('T')
  })

  it('returns null for non-participants and unscored games', () => {
    expect(outcomeFor(match({}), 'zz')).toBeNull()
    expect(outcomeFor(match({ result: 'UNSET' }), 'a')).toBeNull()
  })
})

describe('currentStreak', () => {
  it('counts consecutive recent outcomes, newest first', () => {
    const matches = [
      match({ date: '2026-07-01T19:00:00Z', result: 'TEAM2_WIN' }), // older L for a
      match({ date: '2026-07-02T19:00:00Z', result: 'TEAM1_WIN' }),
      match({ date: '2026-07-03T19:00:00Z', result: 'TEAM1_WIN' })
    ]
    expect(currentStreak(matches, 'a')).toEqual({ type: 'W', length: 2 })
  })

  it('skips games the player did not play', () => {
    const matches = [
      match({ date: '2026-07-02T19:00:00Z', team1Ids: ['x', 'y'], team2Ids: ['z', 'w'] }),
      match({ date: '2026-07-01T19:00:00Z', result: 'TEAM1_WIN' })
    ]
    expect(currentStreak(matches, 'a')).toEqual({ type: 'W', length: 1 })
  })

  it('returns null with no played games', () => {
    expect(currentStreak([], 'a')).toBeNull()
  })
})

describe('hotAndCold', () => {
  it('finds longest current W and L streaks above the minimum', () => {
    const matches = [
      match({ date: '2026-07-05T19:00:00Z', result: 'TEAM1_WIN' }),
      match({ date: '2026-07-04T19:00:00Z', result: 'TEAM1_WIN' }),
      match({ date: '2026-07-03T19:00:00Z', result: 'TEAM1_WIN' })
    ]
    const players = new Map([
      ['a', 'Alice'],
      ['c', 'Cara']
    ])
    const { hot, cold } = hotAndCold(matches, players)
    expect(hot).toMatchObject({ groupPlayerId: 'a', type: 'W', length: 3 })
    expect(cold).toMatchObject({ groupPlayerId: 'c', type: 'L', length: 3 })
  })

  it('ignores streaks below the minimum length', () => {
    const matches = [match({ result: 'TEAM1_WIN' })]
    const { hot, cold } = hotAndCold(matches, new Map([['a', 'Alice']]))
    expect(hot).toBeNull()
    expect(cold).toBeNull()
  })
})

describe('groupByEvent', () => {
  it('groups matches by event, newest event first', () => {
    const matches = [
      match({ eventId: 'e1', date: '2026-07-01T19:00:00Z' }),
      match({ eventId: 'e2', date: '2026-07-05T19:00:00Z' }),
      match({ eventId: 'e2', date: '2026-07-05T19:30:00Z' })
    ]
    const groups = groupByEvent(matches)
    expect(groups).toHaveLength(2)
    expect(groups[0].eventId).toBe('e2')
    expect(groups[0].matches).toHaveLength(2)
  })
})

describe('computeFormGuide', () => {
  it('returns last N outcomes newest first, skipping unscored', () => {
    const matches = [
      match({ date: '2026-07-01T19:00:00Z', result: 'TEAM2_WIN' }),
      match({ date: '2026-07-02T19:00:00Z', result: 'UNSET' }),
      match({ date: '2026-07-03T19:00:00Z', result: 'TIE' }),
      match({ date: '2026-07-04T19:00:00Z', result: 'TEAM1_WIN' })
    ]
    expect(computeFormGuide(matches, 'a', 5)).toEqual(['W', 'T', 'L'])
    expect(computeFormGuide(matches, 'a', 2)).toEqual(['W', 'T'])
  })
})

describe('computeH2H', () => {
  it('computes record, points, and streak from the perspective player', () => {
    const matches = [
      // a beats c 11-7 (newest)
      match({ date: '2026-07-05T19:00:00Z', result: 'TEAM1_WIN', scoreTeam1: 11, scoreTeam2: 7 }),
      // a beats c 11-9
      match({ date: '2026-07-04T19:00:00Z', result: 'TEAM1_WIN', scoreTeam1: 11, scoreTeam2: 9 }),
      // c beats a: a on team1 loses 5-11
      match({ date: '2026-07-03T19:00:00Z', result: 'TEAM2_WIN', scoreTeam1: 5, scoreTeam2: 11 }),
      // tie
      match({ date: '2026-07-02T19:00:00Z', result: 'TIE', scoreTeam1: 8, scoreTeam2: 8 })
    ]
    const record = computeH2H(matches, 'a')
    expect(record.games).toBe(4)
    expect(record.wins).toBe(2)
    expect(record.losses).toBe(1)
    expect(record.ties).toBe(1)
    expect(record.winRate).toBeCloseTo(0.625)
    expect(record.pointsFor).toBe(35)
    expect(record.pointsAgainst).toBe(35)
    expect(record.streak).toEqual({ type: 'W', length: 2 })
    expect(record.lastMeetings[0].scoreTeam1).toBe(11)
  })

  it('handles empty history', () => {
    const record = computeH2H([], 'a')
    expect(record.games).toBe(0)
    expect(record.winRate).toBe(0)
    expect(record.streak).toBeNull()
  })
})
