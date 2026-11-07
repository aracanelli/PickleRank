import { describe, it, expect } from 'vitest'
import { currentRoundIndex, progress, gamesByRound, eventTitle } from './eventProgress'
import type { GameDto } from '@/app/core/models/dto'

const g = (round: number, court: number, s1?: number, s2?: number): GameDto => ({
  id: `${round}-${court}`, roundIndex: round, courtIndex: court, team1: [], team2: [], scoreTeam1: s1, scoreTeam2: s2, result: 'UNSET'
})

describe('eventProgress', () => {
  it('groups by round and sorts courts', () => {
    const r = gamesByRound({ rounds: 2, games: [g(0, 1), g(0, 0), g(1, 0)] })
    expect(r[0].map(x => x.courtIndex)).toEqual([0, 1])
    expect(r[1]).toHaveLength(1)
  })
  it('current round is the first with an unscored court', () => {
    expect(currentRoundIndex({ rounds: 3, games: [g(0, 0, 11, 2), g(1, 0), g(2, 0)] })).toBe(1)
  })
  it('current round is the last when all scored', () => {
    expect(currentRoundIndex({ rounds: 2, games: [g(0, 0, 11, 2), g(1, 0, 4, 11)] })).toBe(1)
  })
  it('a score of 0 counts as scored', () => {
    const p = progress({ rounds: 1, games: [g(0, 0, 11, 0)] })
    expect(p.allScored).toBe(true)
  })
  it('reports counts', () => {
    const p = progress({ rounds: 2, games: [g(0, 0, 11, 2), g(0, 1), g(1, 0), g(1, 1)] })
    expect(p).toMatchObject({ total: 4, scored: 1, remaining: 3, round: 0, roundScored: 1, allScored: false })
  })
  it('titles', () => {
    expect(eventTitle({ name: '  Night 4 ' })).toBe('Night 4')
    expect(eventTitle({})).toBe('Untitled event')
  })
})
