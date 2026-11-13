import { reactive, ref } from 'vue'
import { isNetworkError } from './network'

/**
 * Durable write queue. Every change the user makes is written here first (localStorage),
 * then sent in order. Nothing is lost if the connection drops, the tab is closed, or the
 * phone kills the app: the queue resumes on the next launch or when the connection returns.
 *
 * - FIFO, one request at a time, so "create league" lands before "add player to league".
 * - `key` coalesces: a newer change for the same thing (e.g. one court's score) replaces the
 *   queued body instead of piling up requests. Only the latest value is sent.
 * - No response (offline): wait and retry, forever, with backoff; reconnect retries at once.
 * - 5xx / 408 / 429: retry with backoff, then park as failed after MAX_SERVER_RETRIES.
 * - Other 4xx: the server refused it; park as failed so the user can see, retry or discard it.
 *   Failed ops never block the ops behind them.
 * The server makes replays safe: creates carry client-made ids and score writes carry the
 * time they were typed, so a late replay never duplicates or overwrites newer data.
 */

export type OutboxMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface OutboxOp {
  id: string
  key?: string
  method: OutboxMethod
  url: string
  body?: unknown
  /** Plain words for the sync sheet, e.g. "Court 2 score". */
  label: string
  createdAt: number
  attempts: number
  failed?: boolean
  error?: string
  /** Hold this op (park it as failed) while any op before it has failed, e.g. "complete event". */
  afterAll?: boolean
}

export type OutboxOutcome =
  | { op: OutboxOp; ok: true; data: unknown }
  | { op: OutboxOp; ok: false; error: { status?: number; message?: string }; final: boolean }

export interface OutboxDeps {
  /** `user` is whose queue the op came from; send must not use another user's session for it. */
  send: (op: OutboxOp, user: string) => Promise<unknown>
  /** Called when saving the queue hits the storage quota; free space (e.g. drop cached reads). */
  onStorageFull?: () => void
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  /** Backoff base in ms (tests pass small numbers). */
  baseDelayMs?: number
  maxDelayMs?: number
}

export const MAX_SERVER_RETRIES = 5
const STORE_PREFIX = 'picklerank:outbox:'

function defaultStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

export function createOutbox(deps: OutboxDeps) {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage
  const baseDelay = deps.baseDelayMs ?? 2000
  const maxDelay = deps.maxDelayMs ?? 60000

  const ops = reactive<OutboxOp[]>([])
  /** id of the op whose request is on the wire */
  const sending = ref<string | null>(null)
  /** true while the head op is waiting for a connection */
  const waiting = ref(false)
  const listeners = new Set<(o: OutboxOutcome) => void>()

  let scope: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let networkStrikes = 0
  let seq = 0

  function persist() {
    if (!scope) return
    const write = () => {
      if (ops.length) storage?.setItem(STORE_PREFIX + scope, JSON.stringify(ops))
      else storage?.removeItem(STORE_PREFIX + scope)
    }
    try {
      write()
    } catch {
      // Storage full. Unsent changes matter more than cached reads: free space and try again.
      try { deps.onStorageFull?.(); write() } catch { /* the in-memory queue still runs this session */ }
    }
  }

  /** Drop an op from a user's stored queue when that user is no longer the active one. */
  function removeStored(user: string, id: string) {
    try {
      const raw = storage?.getItem(STORE_PREFIX + user)
      if (!raw) return
      const rest = (JSON.parse(raw) as OutboxOp[]).filter(o => o.id !== id)
      if (rest.length) storage?.setItem(STORE_PREFIX + user, JSON.stringify(rest))
      else storage?.removeItem(STORE_PREFIX + user)
    } catch { /* ignore */ }
  }

  /** Switch to a user's queue (loads what they left unsent). null pauses the queue. */
  function setScope(userId: string | null) {
    if (userId === scope) return
    if (timer) { clearTimeout(timer); timer = null }
    scope = userId
    ops.splice(0, ops.length)
    if (!userId) return
    try {
      const raw = storage?.getItem(STORE_PREFIX + userId)
      if (raw) ops.push(...(JSON.parse(raw) as OutboxOp[]))
    } catch { /* corrupt entry: start empty */ }
    void flush()
  }

  function emit(o: OutboxOutcome) {
    listeners.forEach(fn => { try { fn(o) } catch { /* listener errors stay local */ } })
  }

  function subscribe(fn: (o: OutboxOutcome) => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  function enqueue(input: { key?: string; method: OutboxMethod; url: string; body?: unknown; label: string; afterAll?: boolean }): OutboxOp {
    if (input.key) {
      // Coalesce only into the newest op for this key: folding into an older one would put the
      // newest value ahead of an in-between value still queued behind it.
      const newest = find(input.key)
      const existing = newest && newest.id !== sending.value ? newest : undefined
      if (existing) {
        existing.body = input.body
        existing.url = input.url
        existing.method = input.method
        existing.label = input.label
        existing.failed = false
        existing.error = undefined
        existing.attempts = 0
        persist()
        void flush()
        return existing
      }
    }
    const op: OutboxOp = {
      ...input,
      id: `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      attempts: 0
    }
    ops.push(op)
    persist()
    void flush()
    return op
  }

  function schedule(ms: number) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void flush() }, ms)
  }

  async function flush(): Promise<void> {
    if (running || !scope) return
    running = true
    try {
      for (;;) {
        const op = ops.find(o => !o.failed)
        if (!op) { waiting.value = false; return }
        if (op.afterAll && ops.indexOf(op) > 0 && ops.slice(0, ops.indexOf(op)).some(o => o.failed)) {
          op.failed = true
          op.error = "A change before this one didn't sync. Retry or discard it first."
          persist()
          emit({ op, ok: false, error: { message: op.error }, final: true })
          continue
        }
        sending.value = op.id
        const user: string = scope
        let data: unknown
        let err: { status?: number; message?: string } | null = null
        try {
          data = await deps.send(op, user)
        } catch (e) {
          err = (e as { status?: number; message?: string }) ?? { message: 'Request failed' }
          // 401: the session expired. Keep the op; it sends once the user is signed in again.
          if (isNetworkError(e) || err.status === 401) {
            if (scope !== user) { sending.value = null; return }
            sending.value = null
            waiting.value = true
            networkStrikes++
            schedule(Math.min(maxDelay, baseDelay * Math.pow(2, Math.min(networkStrikes - 1, 6))))
            return
          }
        }
        sending.value = null
        // The user switched while this was on the wire: settle it in their stored queue, not this one.
        if (scope !== user) {
          if (!err || (op.method === 'DELETE' && err.status === 404)) removeStored(user, op.id)
          return
        }
        waiting.value = false
        networkStrikes = 0
        const i = ops.indexOf(op)
        // A replayed delete whose first attempt landed (response lost) finds nothing: that is done.
        if (err && op.method === 'DELETE' && err.status === 404) err = null
        if (!err) {
          if (i !== -1) ops.splice(i, 1)
          persist()
          emit({ op, ok: true, data })
          continue
        }
        const status = err.status ?? 0
        const transient = status >= 500 || status === 408 || status === 429
        op.attempts++
        if (transient && op.attempts < MAX_SERVER_RETRIES) {
          persist()
          emit({ op, ok: false, error: err, final: false })
          schedule(Math.min(maxDelay, baseDelay * Math.pow(2, op.attempts - 1)))
          return
        }
        op.failed = true
        op.error = err.message || (transient ? 'Server error' : 'Not accepted')
        persist()
        emit({ op, ok: false, error: err, final: true })
      }
    } finally {
      running = false
    }
  }

  /** Try again now (reconnect, app back in foreground, or a manual retry). */
  function kick() {
    if (timer) { clearTimeout(timer); timer = null }
    networkStrikes = 0
    void flush()
  }

  function retry(id: string) {
    const op = ops.find(o => o.id === id)
    if (!op) return
    op.failed = false
    op.error = undefined
    op.attempts = 0
    persist()
    kick()
  }

  function retryAll() {
    for (const op of ops) { op.failed = false; op.error = undefined; op.attempts = 0 }
    persist()
    kick()
  }

  function discard(id: string) {
    const i = ops.findIndex(o => o.id === id && o.id !== sending.value)
    if (i === -1) return
    const [op] = ops.splice(i, 1)
    persist()
    // let anyone waiting on it (optimistic screens) revert
    emit({ op, ok: false, error: { message: 'Discarded on this phone' }, final: true })
  }

  function find(key: string) {
    // the newest op for a key is the one the user last entered
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i].key === key) return ops[i]
    return undefined
  }

  return { ops, sending, waiting, setScope, enqueue, flush, kick, retry, retryAll, discard, find, subscribe }
}

export type Outbox = ReturnType<typeof createOutbox>
