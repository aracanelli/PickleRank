import { describe, it, expect, vi, afterEach } from 'vitest'
import { createOutbox, MAX_SERVER_RETRIES, type OutboxOp } from './outbox'

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const tick = () => new Promise(r => setTimeout(r, 0))
const offline = { status: 0, offline: true, message: 'No connection' }

describe('outbox', () => {
  afterEach(() => { vi.useRealTimers() })

  it('sends in order, one at a time', async () => {
    const order: string[] = []
    const gates = [deferred<unknown>(), deferred<unknown>()]
    const send = vi.fn((op: OutboxOp) => { order.push(op.url); return gates[order.length - 1].promise })
    const box = createOutbox({ send, storage: memoryStorage() })
    box.setScope('u1')
    box.enqueue({ method: 'POST', url: '/a', label: 'a' })
    box.enqueue({ method: 'POST', url: '/b', label: 'b' })
    await tick()
    expect(order).toEqual(['/a'])
    gates[0].resolve({})
    await tick(); await tick()
    expect(order).toEqual(['/a', '/b'])
    gates[1].resolve({})
    await tick(); await tick()
    expect(box.ops).toHaveLength(0)
  })

  it('coalesces queued ops with the same key; only the latest body is sent', async () => {
    const first = deferred<unknown>()
    const bodies: unknown[] = []
    const send = vi.fn((op: OutboxOp) => { bodies.push(op.body); return bodies.length === 1 ? first.promise : Promise.resolve({}) })
    const box = createOutbox({ send, storage: memoryStorage() })
    box.setScope('u1')
    box.enqueue({ key: 'score:g1', method: 'PATCH', url: '/g1', body: 1, label: 's' }) // in flight
    await tick()
    box.enqueue({ key: 'score:g1', method: 'PATCH', url: '/g1', body: 2, label: 's' })
    box.enqueue({ key: 'score:g1', method: 'PATCH', url: '/g1', body: 3, label: 's' })
    expect(box.ops).toHaveLength(2) // the in-flight one plus one coalesced follow-up
    first.resolve({})
    await tick(); await tick(); await tick()
    expect(bodies).toEqual([1, 3])
  })

  it('keeps ops through no connection and survives a reload', async () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const send = vi.fn().mockRejectedValue(offline)
    const box = createOutbox({ send, storage, baseDelayMs: 1000 })
    box.setScope('u1')
    box.enqueue({ method: 'POST', url: '/a', body: { x: 1 }, label: 'a' })
    await vi.advanceTimersByTimeAsync(0)
    expect(box.waiting.value).toBe(true)
    expect(box.ops[0].failed).toBeFalsy()
    // many retries while offline never park the op as failed
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(send.mock.calls.length).toBeGreaterThan(MAX_SERVER_RETRIES)
    expect(box.ops[0].failed).toBeFalsy()

    // "reload": a new outbox on the same storage picks the op up and sends it
    const send2 = vi.fn().mockResolvedValue({ ok: 1 })
    const box2 = createOutbox({ send: send2, storage })
    box2.setScope('u1')
    await vi.advanceTimersByTimeAsync(0)
    expect(send2).toHaveBeenCalledWith(expect.objectContaining({ url: '/a', body: { x: 1 } }), 'u1')
    expect(box2.ops).toHaveLength(0)
    expect(storage.raw.size).toBe(0)
  })

  it('reconnect (kick) retries at once instead of waiting out the backoff', async () => {
    vi.useFakeTimers()
    const send = vi.fn().mockRejectedValueOnce(offline).mockResolvedValue({})
    const box = createOutbox({ send, storage: memoryStorage(), baseDelayMs: 60_000 })
    box.setScope('u1')
    box.enqueue({ method: 'POST', url: '/a', label: 'a' })
    await vi.advanceTimersByTimeAsync(0)
    expect(box.ops).toHaveLength(1)
    box.kick()
    await vi.advanceTimersByTimeAsync(0)
    expect(box.ops).toHaveLength(0)
  })

  it('parks a refused op as failed and keeps sending the ones behind it', async () => {
    const send = vi.fn((op: OutboxOp) => op.url === '/bad' ? Promise.reject({ status: 422, message: 'Bad score' }) : Promise.resolve({}))
    const box = createOutbox({ send, storage: memoryStorage() })
    const outcomes: Array<{ ok: boolean; final?: boolean }> = []
    box.subscribe(o => outcomes.push({ ok: o.ok, final: o.ok ? undefined : o.final }))
    box.setScope('u1')
    box.enqueue({ method: 'PATCH', url: '/bad', label: 'bad' })
    box.enqueue({ method: 'PATCH', url: '/good', label: 'good' })
    await tick(); await tick(); await tick()
    expect(box.ops).toHaveLength(1)
    expect(box.ops[0]).toMatchObject({ url: '/bad', failed: true, error: 'Bad score' })
    expect(outcomes).toEqual([{ ok: false, final: true }, { ok: true, final: undefined }])
  })

  it('a replayed delete that finds nothing (404) counts as done', async () => {
    const send = vi.fn().mockRejectedValue({ status: 404, message: 'Not found' })
    const box = createOutbox({ send, storage: memoryStorage() })
    box.setScope('u1')
    box.enqueue({ method: 'DELETE', url: '/api/games/g1', label: 'delete' })
    await tick(); await tick()
    expect(box.ops).toHaveLength(0)
  })

  it('retries server errors with backoff, then parks them', async () => {
    vi.useFakeTimers()
    const send = vi.fn().mockRejectedValue({ status: 503, message: 'Down' })
    const box = createOutbox({ send, storage: memoryStorage(), baseDelayMs: 10 })
    box.setScope('u1')
    box.enqueue({ method: 'POST', url: '/a', label: 'a' })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(send).toHaveBeenCalledTimes(MAX_SERVER_RETRIES)
    expect(box.ops[0].failed).toBe(true)
    box.retry(box.ops[0].id)
    expect(box.ops[0].failed).toBe(false)
  })

  it('after a drop, a new value coalesces into the newest op, never ahead of an in-between one', async () => {
    vi.useFakeTimers()
    let up = false
    const sent: unknown[] = []
    const first = deferred<unknown>()
    const send = vi.fn((op: OutboxOp) => {
      if (!up) return Promise.reject(offline)
      sent.push(op.body)
      return sent.length === 1 ? first.promise : Promise.resolve({})
    })
    const box = createOutbox({ send, storage: memoryStorage(), baseDelayMs: 60_000 })
    box.setScope('u1')
    box.enqueue({ key: 'role', method: 'PATCH', url: '/r', body: 'ORG', label: 'r' })
    await vi.advanceTimersByTimeAsync(0) // fails: offline
    box.enqueue({ key: 'role', method: 'PATCH', url: '/r', body: 'PLAYER', label: 'r' }) // coalesces (nothing sending)
    expect(box.ops.map(o => o.body)).toEqual(['PLAYER'])
    await vi.advanceTimersByTimeAsync(0) // that enqueue's offline attempt settles
    up = true
    box.kick()
    await vi.advanceTimersByTimeAsync(0) // 'PLAYER' in flight
    box.enqueue({ key: 'role', method: 'PATCH', url: '/r', body: 'ORG', label: 'r' }) // behind it
    box.enqueue({ key: 'role', method: 'PATCH', url: '/r', body: 'PLAYER', label: 'r' }) // folds into newest
    first.resolve({})
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toEqual(['PLAYER', 'PLAYER'])
  })

  it('a 401 keeps the op (not failed) for after sign-in', async () => {
    const send = vi.fn().mockRejectedValue({ status: 401, message: 'Please sign in' })
    const box = createOutbox({ send, storage: memoryStorage(), baseDelayMs: 60_000 })
    box.setScope('u1')
    box.enqueue({ method: 'PATCH', url: '/a', label: 'a' })
    await tick(); await tick()
    expect(box.ops[0].failed).toBeFalsy()
  })

  it('an afterAll op waits behind a failed op instead of running without it', async () => {
    const send = vi.fn((op: OutboxOp) => op.url === '/score' ? Promise.reject({ status: 422, message: 'bad' }) : Promise.resolve({}))
    const box = createOutbox({ send, storage: memoryStorage() })
    box.setScope('u1')
    box.enqueue({ method: 'PATCH', url: '/score', label: 's' })
    box.enqueue({ method: 'POST', url: '/complete', label: 'c', afterAll: true })
    await tick(); await tick(); await tick()
    expect(send.mock.calls.map(c => c[0].url)).toEqual(['/score'])
    expect(box.ops.map(o => [o.url, !!o.failed])).toEqual([['/score', true], ['/complete', true]])
  })

  it('discard tells waiters the op is gone', async () => {
    const send = vi.fn().mockRejectedValue(offline)
    const box = createOutbox({ send, storage: memoryStorage(), baseDelayMs: 60_000 })
    const seen: Array<{ ok: boolean; final?: boolean }> = []
    box.subscribe(o => seen.push({ ok: o.ok, final: o.ok ? undefined : o.final }))
    box.setScope('u1')
    const op = box.enqueue({ method: 'POST', url: '/a', label: 'a' })
    await tick()
    box.discard(op.id)
    expect(seen).toEqual([{ ok: false, final: true }])
  })

  it('keeps each user’s queue separate', async () => {
    const storage = memoryStorage()
    const send = vi.fn().mockRejectedValue(offline)
    const box = createOutbox({ send, storage, baseDelayMs: 60_000 })
    box.setScope('u1')
    box.enqueue({ method: 'POST', url: '/u1', label: 'a' })
    box.setScope('u2')
    expect(box.ops).toHaveLength(0)
    box.setScope('u1')
    expect(box.ops.map(o => o.url)).toEqual(['/u1'])
  })
})
