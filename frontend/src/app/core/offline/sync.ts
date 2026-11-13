import { computed, watch } from 'vue'
import { api } from '@/app/core/http/api-client'
import { createOutbox, type OutboxOp, type OutboxOutcome } from './outbox'
import { onReconnect, online } from './network'
import { setPersistScope, clearAllPersisted } from './persist'

/** The app's single write queue. Features enqueue here instead of awaiting the server. */
export const outbox = createOutbox({
  send: (op, user) => api.request(op.method, op.url, op.body, user),
  onStorageFull: clearAllPersisted
})

// A write changed server data: drop in-memory GET caches so the next read is fresh.
// (Copies kept on the device stay, so screens still open instantly and offline.)
outbox.subscribe(o => { if (o.ok) api.invalidateCache() })

/** Resolves when this op is sent successfully or given up on (never on mere "offline"). */
export function whenSettled(op: OutboxOp): Promise<OutboxOutcome> {
  return new Promise(resolve => {
    const off = outbox.subscribe(o => {
      if (o.op.id !== op.id || (!o.ok && !o.final)) return
      off()
      resolve(o)
    })
  })
}

export const syncState = computed(() => {
  const failed = outbox.ops.filter(o => o.failed).length
  const pending = outbox.ops.length - failed
  return { pending, failed, offline: !online.value || outbox.waiting.value }
})

let started = false

/** Wire the queue and the response cache to the signed-in user. Call once after Pinia is ready. */
export function startSync(userId: () => string | null) {
  if (started) return
  started = true
  watch(userId, (next, prev) => {
    // Account switch or sign-out: the old user's kept responses must not show for the next one.
    // Their unsent writes stay stored under their id and resume when they sign back in.
    if (prev && next !== prev) clearAllPersisted()
    setPersistScope(next)
    outbox.setScope(next)
  }, { immediate: true })
  onReconnect(() => outbox.kick())
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') outbox.kick()
    })
  }
}
