import { eventsApi } from './events.api'

/**
 * Persistent score sync service.
 *
 * Scores are written to localStorage immediately on input so they survive
 * browser/app closes, navigation, and network failures.  A background
 * process drains the queue to the server with debounce + retry.
 */

const STORAGE_KEY = 'picklerank_pending_scores'
const DEBOUNCE_MS = 500
const MAX_RETRIES = 5
const BASE_RETRY_MS = 1000
/** Discard pending scores older than 24 hours – they're likely from
 *  a deleted or completed event and would just cause 404s. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000

// ── Types ──────────────────────────────────────────────────────────────

export interface PendingScore {
  gameId: string
  eventId: string
  score1?: number
  score2?: number
  /** ISO timestamp of last local change */
  updatedAt: string
  /** Number of failed server sync attempts */
  retries: number
}

type SyncCallback = (gameId: string, status: 'saving' | 'saved' | 'error', errorMsg?: string) => void

// ── Storage helpers ────────────────────────────────────────────────────

function readQueue(): Map<string, PendingScore> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const arr: PendingScore[] = JSON.parse(raw)
    const now = Date.now()
    // Drop entries older than STALE_THRESHOLD_MS
    const fresh = arr.filter(p => now - new Date(p.updatedAt).getTime() < STALE_THRESHOLD_MS)
    return new Map(fresh.map(p => [p.gameId, p]))
  } catch {
    return new Map()
  }
}

function writeQueue(queue: Map<string, PendingScore>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...queue.values()]))
  } catch {
    // localStorage full or unavailable – best-effort
  }
}

// ── Service singleton ──────────────────────────────────────────────────

class ScoreSyncService {
  private queue: Map<string, PendingScore> = new Map()
  private timers: Map<string, number> = new Map()
  private inflight: Set<string> = new Set()
  private callback: SyncCallback | null = null
  private boundBeforeUnload: (() => void) | null = null
  private boundVisChange: (() => void) | null = null

  /** Restore any scores that were persisted before the app last closed. */
  init(cb: SyncCallback): void {
    this.callback = cb
    this.queue = readQueue()
    this.registerGlobalListeners()
    // Flush anything left over from a previous session
    this.flushAll()
  }

  destroy(): void {
    // Cancel timers
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()

    // Persist remaining queue so the next session can pick it up
    writeQueue(this.queue)

    this.unregisterGlobalListeners()
    this.callback = null
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Enqueue a score change.  Persists to localStorage immediately, then
   * debounces the server sync.
   */
  save(gameId: string, eventId: string, score1?: number, score2?: number): void {
    const entry: PendingScore = {
      gameId,
      eventId,
      score1,
      score2,
      updatedAt: new Date().toISOString(),
      retries: 0,
    }
    this.queue.set(gameId, entry)
    writeQueue(this.queue)
    this.scheduleSave(gameId, DEBOUNCE_MS)
  }

  /** Immediately sync a specific game (e.g. on Enter / blur). */
  saveNow(gameId: string): void {
    this.cancelTimer(gameId)
    if (this.queue.has(gameId)) {
      this.performSave(gameId)
    }
  }

  /** Cancel a pending save (e.g. user pressed Escape). */
  cancel(gameId: string): void {
    this.cancelTimer(gameId)
    this.queue.delete(gameId)
    writeQueue(this.queue)
  }

  /** True if a server request is currently in-flight for this game. */
  isSaving(gameId: string): boolean {
    return this.inflight.has(gameId)
  }

  /** True if a save is queued (debounce pending or retrying). */
  isPending(gameId: string): boolean {
    return this.queue.has(gameId)
  }

  /**
   * Return the locally-persisted score if one exists (so we can restore
   * optimistic state after remount / navigation).
   */
  getPending(gameId: string): PendingScore | undefined {
    return this.queue.get(gameId)
  }

  /** Return all pending scores for a given event. */
  getPendingForEvent(eventId: string): PendingScore[] {
    return [...this.queue.values()].filter(p => p.eventId === eventId)
  }

  /** Remove all pending scores for an event (e.g. after completing it). */
  clearEvent(eventId: string): void {
    for (const [gameId, entry] of this.queue) {
      if (entry.eventId === eventId) {
        this.cancelTimer(gameId)
        this.queue.delete(gameId)
      }
    }
    writeQueue(this.queue)
  }

  // ── Internals ──────────────────────────────────────────────────────

  private scheduleSave(gameId: string, delayMs: number): void {
    this.cancelTimer(gameId)
    const t = window.setTimeout(() => {
      this.timers.delete(gameId)
      this.performSave(gameId)
    }, delayMs)
    this.timers.set(gameId, t)
  }

  private cancelTimer(gameId: string): void {
    const t = this.timers.get(gameId)
    if (t != null) {
      clearTimeout(t)
      this.timers.delete(gameId)
    }
  }

  private async performSave(gameId: string): Promise<void> {
    const entry = this.queue.get(gameId)
    if (!entry) return

    // If already in-flight, the completion handler will pick up the latest queue state
    if (this.inflight.has(gameId)) return

    this.inflight.add(gameId)
    this.callback?.(gameId, 'saving')

    try {
      await eventsApi.updateScore(gameId, {
        scoreTeam1: entry.score1,
        scoreTeam2: entry.score2,
      })

      // Check if the score was updated again while we were saving
      const current = this.queue.get(gameId)
      if (current && current.updatedAt !== entry.updatedAt) {
        // A newer value was queued while we were saving – re-sync
        this.inflight.delete(gameId)
        this.scheduleSave(gameId, 0)
        return
      }

      // Success – remove from queue
      this.queue.delete(gameId)
      writeQueue(this.queue)
      this.inflight.delete(gameId)
      this.callback?.(gameId, 'saved')
    } catch (e: any) {
      this.inflight.delete(gameId)
      entry.retries++
      this.queue.set(gameId, entry)
      writeQueue(this.queue)

      if (entry.retries < MAX_RETRIES) {
        const delay = BASE_RETRY_MS * Math.pow(2, entry.retries - 1)
        console.warn(`Score sync failed for ${gameId}, retry ${entry.retries}/${MAX_RETRIES} in ${delay}ms`)
        this.scheduleSave(gameId, delay)
      } else {
        console.error(`Score sync failed for ${gameId} after ${MAX_RETRIES} attempts`)
        this.callback?.(gameId, 'error', e.message || 'Failed to save score')
        // Keep in queue so next session can try again
      }
    }
  }

  /** Try to flush every pending item right now. */
  private flushAll(): void {
    for (const gameId of this.queue.keys()) {
      if (!this.inflight.has(gameId) && !this.timers.has(gameId)) {
        this.performSave(gameId)
      }
    }
  }

  // ── Page lifecycle ─────────────────────────────────────────────────

  private registerGlobalListeners(): void {
    this.boundBeforeUnload = () => {
      // Persist the queue one last time (timers won't fire after this)
      writeQueue(this.queue)

      // Best-effort sync via sendBeacon for any pending saves
      for (const entry of this.queue.values()) {
        this.trySendBeacon(entry)
      }
    }
    window.addEventListener('beforeunload', this.boundBeforeUnload)

    this.boundVisChange = () => {
      if (document.visibilityState === 'hidden') {
        writeQueue(this.queue)
        for (const entry of this.queue.values()) {
          if (!this.inflight.has(entry.gameId)) {
            this.trySendBeacon(entry)
          }
        }
      } else if (document.visibilityState === 'visible') {
        // Coming back – re-flush anything that didn't sync
        this.queue = readQueue()
        this.flushAll()
      }
    }
    document.addEventListener('visibilitychange', this.boundVisChange)
  }

  private unregisterGlobalListeners(): void {
    if (this.boundBeforeUnload) {
      window.removeEventListener('beforeunload', this.boundBeforeUnload)
      this.boundBeforeUnload = null
    }
    if (this.boundVisChange) {
      document.removeEventListener('visibilitychange', this.boundVisChange)
      this.boundVisChange = null
    }
  }

  /**
   * Use navigator.sendBeacon as a last-resort fire-and-forget sync.
   * This survives page unload where fetch/XHR would be cancelled.
   */
  private trySendBeacon(entry: PendingScore): void {
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
      const url = `${API_BASE}/api/games/${entry.gameId}/score`
      const body = JSON.stringify({
        scoreTeam1: entry.score1,
        scoreTeam2: entry.score2,
      })
      // sendBeacon doesn't support custom headers (auth), so this is
      // best-effort. The queue persists in localStorage regardless, so
      // if beacon fails the next session will retry.
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
    } catch {
      // Best-effort – queue is already persisted in localStorage
    }
  }
}

export const scoreSyncService = new ScoreSyncService()
