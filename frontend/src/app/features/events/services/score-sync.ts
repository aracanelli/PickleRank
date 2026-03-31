import { eventsApi } from './events.api'

/**
 * Persistent score sync service.
 *
 * Scores are written to localStorage instantly on every input so the UI
 * feels immediate.  A background drain loop wakes up every SYNC_INTERVAL_MS,
 * picks up whatever has accumulated, and pushes it to the server one game
 * at a time.  On success the entry is removed from localStorage; on failure
 * it stays for the next cycle (with exponential back-off per game).
 *
 * The user never waits on the network — they can blaze through all the
 * scores and the background process catches up quietly.
 */

const STORAGE_KEY = 'picklerank_pending_scores'
/** How often the background loop wakes up to drain the queue. */
const SYNC_INTERVAL_MS = 3000
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
  /** Timestamp (ms) before which we shouldn't retry (back-off). */
  retryAfter?: number
}

type SyncCallback = (gameId: string, status: 'saving' | 'saved' | 'error', errorMsg?: string) => void

// ── Storage helpers ────────────────────────────────────────────────────

function readQueue(): Map<string, PendingScore> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const arr: PendingScore[] = JSON.parse(raw)
    const now = Date.now()
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
  private inflight: Set<string> = new Set()
  private callback: SyncCallback | null = null
  private drainTimer: number | null = null
  private boundBeforeUnload: (() => void) | null = null
  private boundVisChange: (() => void) | null = null

  /** Start the service: restore any leftover scores and begin draining. */
  init(cb: SyncCallback): void {
    this.callback = cb
    this.queue = readQueue()
    this.registerGlobalListeners()
    this.startDrainLoop()
  }

  destroy(): void {
    this.stopDrainLoop()
    // Persist remaining queue so the next session can pick it up
    writeQueue(this.queue)
    this.unregisterGlobalListeners()
    this.callback = null
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Record a score change.  Persists to localStorage instantly.
   * The background drain loop will push it to the server.
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
  }

  /** Cancel a pending save (e.g. user pressed Escape to discard). */
  cancel(gameId: string): void {
    this.queue.delete(gameId)
    writeQueue(this.queue)
  }

  /** True if a server request is currently in-flight for this game. */
  isSaving(gameId: string): boolean {
    return this.inflight.has(gameId)
  }

  /** True if a save is queued but not yet confirmed by the server. */
  isPending(gameId: string): boolean {
    return this.queue.has(gameId)
  }

  /** Return the locally-persisted score (for restoring optimistic state after remount). */
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
        this.queue.delete(gameId)
      }
    }
    writeQueue(this.queue)
  }

  // ── Background drain loop ─────────────────────────────────────────

  private startDrainLoop(): void {
    if (this.drainTimer != null) return
    // Run immediately on start, then every SYNC_INTERVAL_MS
    this.drain()
    this.drainTimer = window.setInterval(() => this.drain(), SYNC_INTERVAL_MS)
  }

  private stopDrainLoop(): void {
    if (this.drainTimer != null) {
      clearInterval(this.drainTimer)
      this.drainTimer = null
    }
  }

  /**
   * One pass of the drain loop.  Picks up every queued entry that isn't
   * already in-flight or waiting on a back-off timer, and syncs it.
   */
  private drain(): void {
    const now = Date.now()
    for (const [gameId, entry] of this.queue) {
      if (this.inflight.has(gameId)) continue
      if (entry.retryAfter && now < entry.retryAfter) continue
      this.syncOne(gameId, entry)
    }
  }

  private async syncOne(gameId: string, entry: PendingScore): Promise<void> {
    this.inflight.add(gameId)
    this.callback?.(gameId, 'saving')

    try {
      await eventsApi.updateScore(gameId, {
        scoreTeam1: entry.score1,
        scoreTeam2: entry.score2,
      })

      // If the user changed the score again while we were saving, keep the
      // newer value in the queue — it'll be picked up next cycle.
      const current = this.queue.get(gameId)
      if (current && current.updatedAt !== entry.updatedAt) {
        this.inflight.delete(gameId)
        return
      }

      // Success – remove from queue and persist
      this.queue.delete(gameId)
      writeQueue(this.queue)
      this.inflight.delete(gameId)
      this.callback?.(gameId, 'saved')
    } catch (e: any) {
      this.inflight.delete(gameId)
      entry.retries++

      if (entry.retries < MAX_RETRIES) {
        // Exponential back-off: 1s, 2s, 4s, 8s, 16s
        const delay = BASE_RETRY_MS * Math.pow(2, entry.retries - 1)
        entry.retryAfter = Date.now() + delay
        this.queue.set(gameId, entry)
        writeQueue(this.queue)
        console.warn(`Score sync failed for ${gameId}, retry ${entry.retries}/${MAX_RETRIES} in ${delay}ms`)
      } else {
        console.error(`Score sync failed for ${gameId} after ${MAX_RETRIES} attempts`)
        this.callback?.(gameId, 'error', e.message || 'Failed to save score')
        // Keep in queue so next session can try again (retries reset on read
        // since we don't persist retryAfter beyond the stale threshold).
      }
    }
  }

  // ── Page lifecycle ─────────────────────────────────────────────────

  private registerGlobalListeners(): void {
    this.boundBeforeUnload = () => {
      writeQueue(this.queue)
      for (const entry of this.queue.values()) {
        this.trySendBeacon(entry)
      }
    }
    window.addEventListener('beforeunload', this.boundBeforeUnload)

    this.boundVisChange = () => {
      if (document.visibilityState === 'hidden') {
        // App going to background — persist and attempt beacon
        this.stopDrainLoop()
        writeQueue(this.queue)
        for (const entry of this.queue.values()) {
          if (!this.inflight.has(entry.gameId)) {
            this.trySendBeacon(entry)
          }
        }
      } else if (document.visibilityState === 'visible') {
        // Coming back — pick up any leftovers and resume draining
        this.queue = readQueue()
        this.startDrainLoop()
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
   * Best-effort fire-and-forget via sendBeacon.  Survives page unload
   * where fetch would be cancelled.  Won't have auth headers so the
   * server will likely reject it, but localStorage has the backup.
   */
  private trySendBeacon(entry: PendingScore): void {
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
      const url = `${API_BASE}/api/games/${entry.gameId}/score`
      const body = JSON.stringify({
        scoreTeam1: entry.score1,
        scoreTeam2: entry.score2,
      })
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
    } catch {
      // Best-effort – queue is already persisted
    }
  }
}

export const scoreSyncService = new ScoreSyncService()
