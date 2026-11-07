import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useScoreSaver, resultFromScores } from './useScoreSaver'
import type { GameDto } from '@/app/core/models/dto'

function game(id: string, s1?: number, s2?: number): GameDto {
  return { id, roundIndex: 0, courtIndex: 0, team1: [], team2: [], scoreTeam1: s1, scoreTeam2: s2, result: resultFromScores(s1, s2) }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    size: () => m.size
  }
}

const flush = () => new Promise(r => setTimeout(r, 0))

describe('resultFromScores', () => {
  it('handles win, loss, tie and unset', () => {
    expect(resultFromScores(11, 7)).toBe('TEAM1_WIN')
    expect(resultFromScores(7, 11)).toBe('TEAM2_WIN')
    expect(resultFromScores(10, 10)).toBe('TIE')
    expect(resultFromScores(11, undefined)).toBe('UNSET')
  })
})

describe('useScoreSaver', () => {
  let storage: ReturnType<typeof memoryStorage>
  beforeEach(() => { storage = memoryStorage() })
  afterEach(() => { vi.useRealTimers() })

  it('saves, applies the server game, clears the draft', async () => {
    const onSaved = vi.fn()
    const updateScore = vi.fn(async (id: string, b: { scoreTeam1?: number; scoreTeam2?: number }) => game(id, b.scoreTeam1, b.scoreTeam2))
    const s = useScoreSaver({ updateScore, onSaved, storage })
    await s.save('g1', 11, 7)
    expect(updateScore).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(game('g1', 11, 7))
    expect(s.status('g1').state).toBe('saved')
    expect(storage.size()).toBe(0)
  })

  it('rapid taps keep one request in flight and send only the latest value next', async () => {
    const first = deferred<GameDto>()
    const calls: Array<[string, unknown]> = []
    const updateScore = vi.fn((id: string, b: { scoreTeam1?: number; scoreTeam2?: number }) => {
      calls.push([id, b])
      return calls.length === 1 ? first.promise : Promise.resolve(game(id, b.scoreTeam1, b.scoreTeam2))
    })
    const onSaved = vi.fn()
    const s = useScoreSaver({ updateScore, onSaved, storage })
    void s.save('g1', 11, 7)
    void s.save('g1', 11, 8)
    void s.save('g1', 11, 9)
    expect(updateScore).toHaveBeenCalledTimes(1)
    expect(s.status('g1').state).toBe('saving')
    first.resolve(game('g1', 11, 7))
    await flush(); await flush()
    expect(updateScore).toHaveBeenCalledTimes(2)
    expect(calls[1][1]).toEqual({ scoreTeam1: 11, scoreTeam2: 9 })
    // the stale first response was never applied
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(game('g1', 11, 9))
  })

  it('a failure with nothing queued keeps the draft and marks the game failed', async () => {
    const updateScore = vi.fn(async () => { throw { message: 'Network down' } })
    const s = useScoreSaver({ updateScore, onSaved: vi.fn(), storage })
    await s.save('g1', 11, 7)
    expect(s.status('g1')).toEqual({ state: 'failed', draft: { score1: 11, score2: 7 }, error: 'Network down' })
    expect(storage.getItem('picklerank:score-draft:g1')).toBe(JSON.stringify({ score1: 11, score2: 7 }))
    expect(s.hasUnsaved()).toBe(true)
  })

  it('retry resends the kept draft', async () => {
    let fail = true
    const updateScore = vi.fn(async (id: string, b: { scoreTeam1?: number; scoreTeam2?: number }) => {
      if (fail) throw new Error('boom')
      return game(id, b.scoreTeam1, b.scoreTeam2)
    })
    const onSaved = vi.fn()
    const s = useScoreSaver({ updateScore, onSaved, storage })
    await s.save('g1', 11, 7)
    fail = false
    await s.retry('g1')
    expect(onSaved).toHaveBeenCalledWith(game('g1', 11, 7))
    expect(s.status('g1').state).toBe('saved')
    expect(s.hasUnsaved()).toBe(false)
  })

  it('a failure with a newer value queued retries with exponential backoff', async () => {
    vi.useFakeTimers()
    const first = deferred<GameDto>()
    const updateScore = vi.fn((id: string, b: { scoreTeam1?: number; scoreTeam2?: number }) =>
      updateScore.mock.calls.length === 1 ? first.promise : Promise.resolve(game(id, b.scoreTeam1, b.scoreTeam2)))
    const onSaved = vi.fn()
    const s = useScoreSaver({ updateScore, onSaved, storage, retryBaseDelayMs: 1000 })
    void s.save('g1', 11, 7)
    void s.save('g1', 11, 8)
    first.reject(new Error('timeout'))
    await vi.advanceTimersByTimeAsync(0)
    expect(updateScore).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1999)
    expect(updateScore).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(updateScore).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(0)
    expect(onSaved).toHaveBeenCalledWith(game('g1', 11, 8))
  })

  it('restoreDrafts surfaces scores that never reached the server', () => {
    storage.setItem('picklerank:score-draft:g1', JSON.stringify({ score1: 11, score2: 4 }))
    storage.setItem('picklerank:score-draft:g2', JSON.stringify({ score1: 9, score2: 11 }))
    const s = useScoreSaver({ updateScore: vi.fn(), onSaved: vi.fn(), storage })
    s.restoreDrafts([game('g1'), game('g2', 9, 11)])
    expect(s.status('g1').state).toBe('failed')
    expect(s.status('g1').draft).toEqual({ score1: 11, score2: 4 })
    // g2 already matches the server, so its draft is dropped
    expect(s.status('g2').state).toBe('idle')
    expect(storage.getItem('picklerank:score-draft:g2')).toBeNull()
  })

  it('reset ignores responses from before the reset', async () => {
    const first = deferred<GameDto>()
    const onSaved = vi.fn()
    const s = useScoreSaver({ updateScore: () => first.promise, onSaved, storage })
    void s.save('g1', 11, 7)
    s.reset()
    first.resolve(game('g1', 11, 7))
    await flush()
    expect(onSaved).not.toHaveBeenCalled()
    expect(s.status('g1').state).toBe('idle')
  })
})
