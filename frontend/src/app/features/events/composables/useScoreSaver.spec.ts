import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useScoreSaver, resultFromScores } from './useScoreSaver'
import { createOutbox, type OutboxOp } from '@/app/core/offline/outbox'
import { online } from '@/app/core/offline/network'
import type { EventDto, GameDto } from '@/app/core/models/dto'

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
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)) }
type Body = { scoreTeam1?: number; scoreTeam2?: number; editedAt: number }
const echo = (op: OutboxOp) => {
  const b = op.body as Body
  return Promise.resolve(game(op.url.split('/')[3], b.scoreTeam1, b.scoreTeam2))
}

describe('resultFromScores', () => {
  it('handles win, loss, tie and unset', () => {
    expect(resultFromScores(11, 7)).toBe('TEAM1_WIN')
    expect(resultFromScores(7, 11)).toBe('TEAM2_WIN')
    expect(resultFromScores(10, 10)).toBe('TIE')
    expect(resultFromScores(11, undefined)).toBe('UNSET')
  })
})

describe('useScoreSaver', () => {
  beforeEach(() => { online.value = true })

  function setup(send: (op: OutboxOp) => Promise<unknown>) {
    const box = createOutbox({ send, storage: memoryStorage(), baseDelayMs: 60_000 })
    box.setScope('u1')
    const onSaved = vi.fn()
    const onFailed = vi.fn()
    const s = useScoreSaver({ onSaved, onFailed, outbox: box })
    return { box, s, onSaved, onFailed }
  }

  it('saves with the time it was typed, applies the server game, then reports saved', async () => {
    const send = vi.fn(echo)
    const { s, onSaved } = setup(send)
    const before = Date.now()
    s.save('g1', 11, 7)
    expect(s.status('g1')).toMatchObject({ state: 'saving', draft: { score1: 11, score2: 7 } })
    await flush()
    expect((send.mock.calls[0][0].body as Body).editedAt).toBeGreaterThanOrEqual(before)
    expect(onSaved).toHaveBeenCalledWith(game('g1', 11, 7))
    expect(s.status('g1').state).toBe('saved')
  })

  it('rapid taps keep one request in flight and send only the latest value next, without flicker', async () => {
    const first = deferred<unknown>()
    const sent: Body[] = []
    const send = vi.fn((op: OutboxOp) => { sent.push(op.body as Body); return sent.length === 1 ? first.promise : echo(op) })
    const { s, onSaved } = setup(send)
    s.save('g1', 11, 1)
    await flush()
    s.save('g1', 11, 2)
    s.save('g1', 11, 3)
    first.resolve(game('g1', 11, 1))
    await flush()
    expect(sent.map(b => b.scoreTeam2)).toEqual([1, 3])
    // the stale 11-1 response was never applied over the newer entry
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(game('g1', 11, 3))
  })

  it('no connection: the score is queued (not failed) and sends when the connection returns', async () => {
    let up = false
    const send = vi.fn((op: OutboxOp) => up ? echo(op) : Promise.reject({ status: 0, offline: true }))
    const { box, s, onSaved, onFailed } = setup(send)
    s.save('g1', 11, 4)
    await flush()
    expect(s.status('g1')).toMatchObject({ state: 'queued', draft: { score1: 11, score2: 4 } })
    expect(s.hasUnsaved(['g1'])).toBe(true)
    expect(s.hasFailed(['g1'])).toBe(false)
    up = true
    box.kick()
    await flush()
    expect(onSaved).toHaveBeenCalledWith(game('g1', 11, 4))
    expect(onFailed).not.toHaveBeenCalled()
    expect(s.hasUnsaved(['g1'])).toBe(false)
  })

  it('a refused score is failed, keeps the draft, and retry sends it again', async () => {
    let refuse = true
    const send = vi.fn((op: OutboxOp) => refuse ? Promise.reject({ status: 400, message: 'Nope' }) : echo(op))
    const { s, onFailed, onSaved } = setup(send)
    s.save('g1', 11, 3)
    await flush()
    expect(s.status('g1')).toMatchObject({ state: 'failed', draft: { score1: 11, score2: 3 }, error: 'Nope' })
    expect(onFailed).toHaveBeenCalledWith('g1', { score1: 11, score2: 3 }, 'Nope')
    refuse = false
    s.retry('g1')
    await flush()
    expect(onSaved).toHaveBeenCalledWith(game('g1', 11, 3))
  })

  it('applyPending overlays queued scores on server data', async () => {
    const { s } = setup(() => new Promise(() => {}))
    s.save('g2', 9, 11)
    const ev = { id: 'e', games: [game('g1', 11, 2), game('g2')] } as unknown as EventDto
    const out = s.applyPending(ev)
    expect(out.games[0]).toBe(ev.games[0])
    expect(out.games[1]).toMatchObject({ scoreTeam1: 9, scoreTeam2: 11, result: 'TEAM2_WIN' })
  })

  it('discardAll drops queued scores for removed games', async () => {
    const { s } = setup(() => Promise.reject({ status: 0, offline: true }))
    s.save('g1', 1, 2)
    s.save('g2', 3, 4)
    await flush()
    s.discardAll(['g2'])
    expect(s.hasUnsaved(['g2'])).toBe(false)
  })
})
