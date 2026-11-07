import { describe, it, expect } from 'vitest'
import { roundPlayers, validateTeams, mergeLive, relaxNote } from './liveEdits'
import type { EventDto, GameDto } from '@/app/core/models/dto'

const p = (id: string) => ({ id, displayName: id.toUpperCase() })
const g = (id: string, court: number, ids: string[], s1?: number, s2?: number): GameDto => ({
  id, roundIndex: 0, courtIndex: court, team1: [p(ids[0]), p(ids[1])], team2: [p(ids[2]), p(ids[3])], scoreTeam1: s1, scoreTeam2: s2, result: 'UNSET'
})
const ev = (games: GameDto[], status: EventDto['status'] = 'IN_PROGRESS'): EventDto => ({ id: 'e', groupId: 'g', status, courts: 2, rounds: 1, participantCount: 8, games })

describe('liveEdits', () => {
  const c1 = g('g1', 0, ['a', 'b', 'c', 'd'])
  const c2 = g('g2', 1, ['e', 'f', 'g', 'h'])
  const names = new Map([['e', 'Eve']])

  it('round players are unique and sorted', () => {
    expect(roundPlayers([c1, c2]).map(x => x.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
  })
  it('team change needs four different players', () => {
    expect(validateTeams({ team1P1: 'a', team1P2: '', team2P1: 'c', team2P2: 'd' }, c1, [c1, c2], names)).toMatch(/all four/)
    expect(validateTeams({ team1P1: 'a', team1P2: 'a', team2P1: 'c', team2P2: 'd' }, c1, [c1, c2], names)).toMatch(/different/)
  })
  it('blocks a player already on another court this round', () => {
    expect(validateTeams({ team1P1: 'a', team1P2: 'e', team2P1: 'c', team2P2: 'd' }, c1, [c1, c2], names)).toBe('Eve is already on court 2 this round.')
  })
  it('accepts a valid change', () => {
    expect(validateTeams({ team1P1: 'b', team1P2: 'a', team2P1: 'd', team2P2: 'c' }, c1, [c1, c2], names)).toBe('')
  })
  it('live merge keeps busy courts local and never moves status backwards', () => {
    const local = ev([g('g1', 0, ['a', 'b', 'c', 'd'], 11, 2), c2], 'IN_PROGRESS')
    const fresh = ev([g('g1', 0, ['a', 'b', 'c', 'd']), g('g2', 1, ['e', 'f', 'g', 'h'], 11, 9)], 'GENERATED')
    const m = mergeLive(local, fresh, id => id === 'g1')
    expect(m.games[0].scoreTeam1).toBe(11)
    expect(m.games[1].scoreTeam2).toBe(9)
    expect(m.status).toBe('IN_PROGRESS')
  })
  it('relax note only when the gap was widened', () => {
    const base = { seedUsed: '1', attempts: 1, durationMs: 1, constraintToggles: {} }
    expect(relaxNote({ ...base, eloDiffConfigured: 0.05, eloDiffUsed: 0.05, relaxIterations: 0 })).toBe('')
    expect(relaxNote({ ...base, eloDiffConfigured: 0.05, eloDiffUsed: 0.08, relaxIterations: 3 })).toContain('up to 8%')
  })
})
