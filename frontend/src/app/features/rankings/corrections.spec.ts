import { describe, it, expect, vi } from 'vitest'
import type { GameDto } from '@/app/core/models/dto'
import {
  emptyStaged, stageScore, currentScores, swapPlayers, currentLineup, stageDelete, undoDelete,
  changeCount, isDirty, scoreErrors, saveCorrections, nameMap, SWAP_ROUND_ERROR, type CorrectionApi
} from './corrections'

const p = (id: string) => ({ id, displayName: id.toUpperCase() })
const game = (id: string, round: number, ids: string[], s1?: number, s2?: number): GameDto => ({
  id, roundIndex: round, courtIndex: 0, team1: [p(ids[0]), p(ids[1])], team2: [p(ids[2]), p(ids[3])],
  scoreTeam1: s1, scoreTeam2: s2, result: 'TEAM1_WIN'
})
const g1 = game('g1', 0, ['a', 'b', 'c', 'd'], 11, 7)
const g2 = game('g2', 0, ['e', 'f', 'g', 'h'], 11, 9)
const g3 = game('g3', 1, ['a', 'e', 'b', 'f'], 5, 11)
const games = [g1, g2, g3]

describe('score staging', () => {
  it('stages only real differences', () => {
    const s = emptyStaged()
    stageScore(s, g1, 1, '9')
    expect(currentScores(s, g1)).toEqual({ s1: '9', s2: '7' })
    expect(changeCount(s)).toBe(1)
    stageScore(s, g1, 1, '11')
    expect(changeCount(s)).toBe(0)
    expect(isDirty(s)).toBe(false)
  })

  it('treats a missing saved score as empty text', () => {
    const s = emptyStaged()
    const g = game('gx', 0, ['a', 'b', 'c', 'd'])
    expect(currentScores(s, g)).toEqual({ s1: '', s2: '' })
    stageScore(s, g, 1, '0')
    expect(scoreErrors(s)).toEqual({ gx: { error1: undefined, error2: 'Enter a score' } })
  })
})

describe('swapPlayers', () => {
  it('swaps within one game', () => {
    const s = emptyStaged()
    expect(swapPlayers(s, games, { gameId: 'g1', slot: 'team1P1' }, { gameId: 'g1', slot: 'team2P1' })).toBeNull()
    expect(currentLineup(s, g1)).toEqual({ team1P1: 'c', team1P2: 'b', team2P1: 'a', team2P2: 'd' })
  })

  it('swaps across two games of the same round', () => {
    const s = emptyStaged()
    swapPlayers(s, games, { gameId: 'g1', slot: 'team1P2' }, { gameId: 'g2', slot: 'team2P2' })
    expect(currentLineup(s, g1).team1P2).toBe('h')
    expect(currentLineup(s, g2).team2P2).toBe('b')
    expect(changeCount(s)).toBe(2)
    // swapping back clears both
    swapPlayers(s, games, { gameId: 'g1', slot: 'team1P2' }, { gameId: 'g2', slot: 'team2P2' })
    expect(changeCount(s)).toBe(0)
  })

  it('refuses swaps across rounds and with deleted games', () => {
    const s = emptyStaged()
    expect(swapPlayers(s, games, { gameId: 'g1', slot: 'team1P1' }, { gameId: 'g3', slot: 'team1P1' })).toBe(SWAP_ROUND_ERROR)
    stageDelete(s, 'g2')
    expect(swapPlayers(s, games, { gameId: 'g1', slot: 'team1P1' }, { gameId: 'g2', slot: 'team1P1' })).toMatch(/deletion/)
    expect(changeCount(s)).toBe(1)
  })

  it('names players from every game in the event', () => {
    expect(nameMap(games).h).toBe('H')
  })
})

describe('deletes', () => {
  it('drops other staged changes for the game and can be undone', () => {
    const s = emptyStaged()
    stageScore(s, g1, 2, '3')
    swapPlayers(s, games, { gameId: 'g1', slot: 'team1P1' }, { gameId: 'g1', slot: 'team1P2' })
    stageDelete(s, 'g1')
    expect(s).toMatchObject({ scores: {}, swaps: {}, deletes: ['g1'] })
    undoDelete(s, 'g1')
    expect(isDirty(s)).toBe(false)
  })
})

function fakeApi(over: Partial<Record<keyof CorrectionApi, (id?: string) => Promise<unknown>>> = {}) {
  const calls: string[] = []
  const api: CorrectionApi = {
    deleteGame: vi.fn(async (id: string) => { calls.push(`delete ${id}`); return over.deleteGame?.(id) }),
    updateScore: vi.fn(async (id: string) => { calls.push(`score ${id}`); return over.updateScore?.(id) }),
    updateGamePlayers: vi.fn(async (id: string) => { calls.push(`players ${id}`); return over.updateGamePlayers?.(id) }),
    recalculate: vi.fn(async () => { calls.push('recalc'); return over.recalculate?.() })
  }
  return { api, calls }
}

describe('saveCorrections', () => {
  it('deletes first, then scores and swaps, then recalculates once', async () => {
    const s = emptyStaged()
    stageDelete(s, 'g3')
    stageScore(s, g1, 1, '12')
    swapPlayers(s, games, { gameId: 'g2', slot: 'team1P1' }, { gameId: 'g2', slot: 'team2P1' })
    const { api, calls } = fakeApi()
    expect(await saveCorrections(s, api)).toEqual({ ok: true })
    expect(calls[0]).toBe('delete g3')
    expect(calls.slice(1, 3).sort()).toEqual(['players g2', 'score g1'])
    expect(calls[3]).toBe('recalc')
    expect(api.updateScore).toHaveBeenCalledWith('g1', { scoreTeam1: 12, scoreTeam2: 7 })
    expect(isDirty(s)).toBe(false)
  })

  it('stops at a failed delete without sending updates or recalculating', async () => {
    const s = emptyStaged()
    stageDelete(s, 'g1')
    stageDelete(s, 'g2')
    stageScore(s, g3, 1, '6')
    const { api, calls } = fakeApi({ deleteGame: async id => { if (id === 'g2') throw new Error('Nope') } })
    const r = await saveCorrections(s, api)
    expect(r).toEqual({ ok: false, failures: [{ gameId: 'g2', kind: 'delete', message: 'Nope' }] })
    expect(calls).toEqual(['delete g1', 'delete g2'])
    // only what is left is retried
    expect(s.deletes).toEqual(['g2'])
    expect(s.pendingRecalc).toBe(true)
  })

  it('does not recalculate when an update fails, and keeps only the failed one', async () => {
    const s = emptyStaged()
    stageScore(s, g1, 1, '1')
    stageScore(s, g2, 1, '2')
    const { api, calls } = fakeApi({ updateScore: async id => { if (id === 'g2') throw new Error('503') } })
    const r = await saveCorrections(s, api)
    expect(r.ok).toBe(false)
    expect(calls).not.toContain('recalc')
    expect(Object.keys(s.scores)).toEqual(['g2'])

    const retry = fakeApi()
    expect(await saveCorrections(s, retry.api)).toEqual({ ok: true })
    expect(retry.calls).toEqual(['score g2', 'recalc'])
  })

  it('keeps the recalculation pending when it fails', async () => {
    const s = emptyStaged()
    stageScore(s, g1, 1, '1')
    const { api } = fakeApi({ recalculate: async () => { throw new Error('Busy') } })
    expect(await saveCorrections(s, api)).toEqual({ ok: false, failures: [], recalcError: 'Busy' })
    expect(changeCount(s)).toBe(0)
    expect(isDirty(s)).toBe(true)
  })

  it('does nothing when nothing is staged', async () => {
    const { api, calls } = fakeApi()
    expect(await saveCorrections(emptyStaged(), api)).toEqual({ ok: true })
    expect(calls).toEqual([])
  })
})
