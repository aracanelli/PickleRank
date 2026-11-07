import { reactive } from 'vue'
import type { GameDto, GameResult } from '@/app/core/models/dto'

/**
 * Per-game score persistence for live scoring.
 *
 * Carried forward from the original EventDetailPage engine:
 * - one request in flight per game; newer values queue behind it (latest value wins)
 * - a response is not applied while a newer value is queued (no stale flicker)
 * - queued retries back off at RETRY_BASE_DELAY_MS * 2^attempt, up to MAX_RETRIES
 *
 * Changed: a final failure keeps the entered score as a draft (also in sessionStorage,
 * so it survives a reload) and marks the game failed, instead of reloading the event
 * and discarding what the organizer typed.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

export interface ScoreDraft {
  score1?: number
  score2?: number
}

export interface GameSaveStatus {
  state: SaveState
  draft?: ScoreDraft
  error?: string
}

export interface ScoreSaverOptions {
  updateScore: (gameId: string, body: { scoreTeam1?: number; scoreTeam2?: number }) => Promise<GameDto>
  onSaved: (game: GameDto) => void
  onFailed?: (gameId: string, draft: ScoreDraft, message: string) => void
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  retryBaseDelayMs?: number
  maxRetries?: number
}

export const RETRY_BASE_DELAY_MS = 1000
export const MAX_RETRIES = 5
const DRAFT_PREFIX = 'picklerank:score-draft:'

export function resultFromScores(score1?: number, score2?: number): GameResult {
  if (score1 == null || score2 == null) return 'UNSET'
  if (score1 > score2) return 'TEAM1_WIN'
  if (score2 > score1) return 'TEAM2_WIN'
  return 'TIE'
}

function defaultStorage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

export function useScoreSaver(options: ScoreSaverOptions) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const baseDelay = options.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS
  const maxRetries = options.maxRetries ?? MAX_RETRIES

  const statuses = reactive(new Map<string, GameSaveStatus>())
  const inFlight = new Set<string>()
  const queued = new Map<string, ScoreDraft>()
  const attempts = new Map<string, number>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  // Bumped by reset(); responses from an older generation are ignored.
  let generation = 0

  function writeDraft(gameId: string, draft: ScoreDraft) {
    try { storage?.setItem(DRAFT_PREFIX + gameId, JSON.stringify(draft)) } catch { /* storage full or blocked */ }
  }
  function clearDraft(gameId: string) {
    try { storage?.removeItem(DRAFT_PREFIX + gameId) } catch { /* ignore */ }
  }
  function readDraft(gameId: string): ScoreDraft | null {
    try {
      const raw = storage?.getItem(DRAFT_PREFIX + gameId)
      return raw ? (JSON.parse(raw) as ScoreDraft) : null
    } catch {
      return null
    }
  }

  function setStatus(gameId: string, status: GameSaveStatus) {
    statuses.set(gameId, status)
  }

  async function send(gameId: string, draft: ScoreDraft) {
    const gen = generation
    inFlight.add(gameId)
    setStatus(gameId, { state: 'saving', draft })
    let failed: unknown = null
    try {
      const updated = await options.updateScore(gameId, { scoreTeam1: draft.score1, scoreTeam2: draft.score2 })
      if (gen !== generation) return
      if (!queued.has(gameId)) {
        attempts.delete(gameId)
        clearDraft(gameId)
        setStatus(gameId, { state: 'saved' })
        options.onSaved(updated)
      }
    } catch (e) {
      if (gen !== generation) return
      failed = e
    } finally {
      if (gen === generation) {
        inFlight.delete(gameId)
        afterSend(gameId, draft, failed)
      }
    }
  }

  function afterSend(gameId: string, lastDraft: ScoreDraft, failed: unknown) {
    const next = queued.get(gameId)
    if (failed) {
      const count = (attempts.get(gameId) ?? 0) + 1
      attempts.set(gameId, count)
      if (next && count < maxRetries) {
        queued.delete(gameId)
        setStatus(gameId, { state: 'saving', draft: next })
        timers.set(gameId, setTimeout(() => {
          timers.delete(gameId)
          void dispatch(gameId, next)
        }, baseDelay * Math.pow(2, count)))
        return
      }
      queued.delete(gameId)
      attempts.delete(gameId)
      const draft = next ?? lastDraft
      writeDraft(gameId, draft)
      const message = (failed as { message?: string })?.message
      setStatus(gameId, { state: 'failed', draft, error: message || 'Score not saved' })
      options.onFailed?.(gameId, draft, message || 'Score not saved')
      return
    }
    if (next) {
      queued.delete(gameId)
      void dispatch(gameId, next)
    }
  }

  function dispatch(gameId: string, draft: ScoreDraft): Promise<void> | void {
    if (inFlight.has(gameId)) {
      queued.set(gameId, draft)
      setStatus(gameId, { state: 'saving', draft })
      return
    }
    return send(gameId, draft)
  }

  /** Save a score. Rapid repeat calls coalesce: one request in flight, latest value queued. */
  function save(gameId: string, score1?: number, score2?: number) {
    const draft: ScoreDraft = { score1, score2 }
    writeDraft(gameId, draft)
    const t = timers.get(gameId)
    if (t) {
      clearTimeout(t)
      timers.delete(gameId)
    }
    return dispatch(gameId, draft)
  }

  function retry(gameId: string) {
    const draft = statuses.get(gameId)?.draft ?? readDraft(gameId)
    if (!draft) return
    attempts.delete(gameId)
    return save(gameId, draft.score1, draft.score2)
  }

  /** Restore unsaved drafts from a previous page load as failed entries the organizer can retry. */
  function restoreDrafts(games: GameDto[]) {
    for (const g of games) {
      const draft = readDraft(g.id)
      if (!draft) continue
      if (draft.score1 === g.scoreTeam1 && draft.score2 === g.scoreTeam2) {
        clearDraft(g.id)
        continue
      }
      setStatus(g.id, { state: 'failed', draft, error: 'Score not saved before the page closed' })
    }
  }

  function discardDraft(gameId: string) {
    clearDraft(gameId)
    statuses.delete(gameId)
  }

  function status(gameId: string): GameSaveStatus {
    return statuses.get(gameId) ?? { state: 'idle' }
  }

  function hasUnsaved() {
    for (const s of statuses.values()) {
      if (s.state === 'saving' || s.state === 'failed') return true
    }
    return false
  }

  function isBusy() {
    for (const s of statuses.values()) if (s.state === 'saving') return true
    return false
  }

  /** Forget in-memory state (e.g. after regenerating). Drafts for the old games are dropped. */
  function reset() {
    generation++
    timers.forEach(t => clearTimeout(t))
    timers.clear()
    for (const id of statuses.keys()) clearDraft(id)
    statuses.clear()
    inFlight.clear()
    queued.clear()
    attempts.clear()
  }

  function dispose() {
    timers.forEach(t => clearTimeout(t))
    timers.clear()
  }

  return { save, retry, restoreDrafts, discardDraft, status, statuses, hasUnsaved, isBusy, reset, dispose }
}
