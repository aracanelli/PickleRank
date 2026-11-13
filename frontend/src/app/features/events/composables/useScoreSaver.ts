import { reactive, computed } from 'vue'
import type { GameDto, GameResult, EventDto } from '@/app/core/models/dto'
import { outbox as appOutbox } from '@/app/core/offline/sync'
import { online } from '@/app/core/offline/network'
import type { Outbox } from '@/app/core/offline/outbox'

/**
 * Per-game score persistence for live scoring, on top of the app's durable outbox.
 *
 * - A saved score is written to the outbox (localStorage) before anything is sent, so it
 *   survives no connection, a closed tab, or a killed app, and syncs on its own later.
 * - Rapid saves of one court coalesce: only the latest value is sent.
 * - A response is not applied while a newer value for that court is still queued (no flicker).
 * - Each write carries `editedAt` (when it was typed). The server keeps whichever edit is newest,
 *   so a phone that comes back online late never overwrites a newer score from another phone;
 *   it gets the newer score back and shows that instead.
 * - Only a refusal or repeated server errors mark a court failed; no connection is just "queued".
 */

export type SaveState = 'idle' | 'saving' | 'queued' | 'saved' | 'failed'

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
  onSaved: (game: GameDto) => void
  onFailed?: (gameId: string, draft: ScoreDraft, message: string) => void
  outbox?: Outbox
}

interface ScoreBody { scoreTeam1?: number; scoreTeam2?: number; editedAt: number; baseEditedAt?: number | null }

const keyOf = (gameId: string) => `score:${gameId}`

export function resultFromScores(score1?: number, score2?: number): GameResult {
  if (score1 == null || score2 == null) return 'UNSET'
  if (score1 > score2) return 'TEAM1_WIN'
  if (score2 > score1) return 'TEAM2_WIN'
  return 'TIE'
}

export function useScoreSaver(options: ScoreSaverOptions) {
  const box = options.outbox ?? appOutbox
  const saved = reactive(new Set<string>())
  const offline = computed(() => !online.value || box.waiting.value)

  const unsubscribe = box.subscribe(o => {
    const key = o.op.key
    if (!key?.startsWith('score:')) return
    const gameId = key.slice(6)
    if (o.ok) {
      if (box.find(key)) return // a newer value is queued; wait for it
      saved.add(gameId)
      options.onSaved(o.data as GameDto)
    } else if (o.final) {
      const b = o.op.body as ScoreBody
      options.onFailed?.(gameId, { score1: b.scoreTeam1, score2: b.scoreTeam2 }, o.op.error || 'Score not saved')
    }
  })

  function draftOf(gameId: string): ScoreDraft | undefined {
    const b = box.find(keyOf(gameId))?.body as ScoreBody | undefined
    return b ? { score1: b.scoreTeam1, score2: b.scoreTeam2 } : undefined
  }

  /** Save a score. Rapid repeat calls coalesce: only the latest value is sent. */
  /** @param baseEditedAt - the game's editedAt as this device last saw it (server copy) */
  function save(gameId: string, score1?: number, score2?: number, label = 'Court score', baseEditedAt?: number | null) {
    saved.delete(gameId)
    const body: ScoreBody = { scoreTeam1: score1, scoreTeam2: score2, editedAt: Date.now(), baseEditedAt: baseEditedAt ?? null }
    box.enqueue({ key: keyOf(gameId), method: 'PATCH', url: `/api/games/${gameId}/score`, body, label })
  }

  function retry(gameId: string) {
    const op = box.find(keyOf(gameId))
    if (op) box.retry(op.id)
  }

  function discardDraft(gameId: string) {
    const op = box.find(keyOf(gameId))
    if (op) box.discard(op.id)
    saved.delete(gameId)
  }

  /** Drop queued scores for games that no longer exist (schedule reshuffled, event deleted). */
  function discardAll(gameIds: string[]) {
    gameIds.forEach(discardDraft)
  }

  function status(gameId: string): GameSaveStatus {
    const op = box.find(keyOf(gameId))
    if (op) {
      const draft = draftOf(gameId)
      if (op.failed) return { state: 'failed', draft, error: op.error }
      return { state: offline.value && box.sending.value !== op.id ? 'queued' : 'saving', draft }
    }
    return { state: saved.has(gameId) ? 'saved' : 'idle' }
  }

  /** Any court of these games still waiting to reach the server (queued, saving or failed). */
  function hasUnsaved(gameIds: string[]) {
    return gameIds.some(id => !!box.find(keyOf(id)))
  }

  function hasFailed(gameIds: string[]) {
    return gameIds.some(id => !!box.find(keyOf(id))?.failed)
  }

  /** Overlay queued scores on server data so progress, rounds and tiles show what was entered. */
  function applyPending(e: EventDto): EventDto {
    let changed = false
    const games = e.games.map(g => {
      const d = draftOf(g.id)
      if (!d) return g
      changed = true
      return { ...g, scoreTeam1: d.score1, scoreTeam2: d.score2, result: resultFromScores(d.score1, d.score2) }
    })
    return changed ? { ...e, games } : e
  }

  function dispose() {
    unsubscribe()
  }

  return { save, retry, discardDraft, discardAll, status, hasUnsaved, hasFailed, applyPending, dispose }
}
