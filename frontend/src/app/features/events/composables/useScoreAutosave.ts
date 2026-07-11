import { ref, onUnmounted, type Ref } from 'vue'
import { eventsApi } from '../services/events.api'
import type { EventDto, GameResult } from '@/app/core/models/dto'

// Autosave engine extracted from the legacy EventDetailPage: optimistic
// updates + 500ms debounce per game, a single in-flight save per game with
// queued follow-ups, and exponential-backoff retries (1s base, max 5).
const DEBOUNCE_DELAY = 500
const RETRY_BASE_DELAY_MS = 1000
const MAX_RETRIES = 5

export function getResultFromScores(score1?: number, score2?: number): GameResult {
  if (score1 === undefined || score2 === undefined) return 'UNSET'
  if (score1 > score2) return 'TEAM1_WIN'
  if (score2 > score1) return 'TEAM2_WIN'
  return 'TIE'
}

export function useScoreAutosave(
  event: Ref<EventDto | null>,
  options: {
    /** Surface a fatal save error (after retries exhausted). */
    onError: (message: string) => void
    /** Reload the event to reset state after a fatal error. */
    reload: () => Promise<void>
  }
) {
  const savingGameIds = ref<Set<string>>(new Set())
  // Recently saved games, for the brief success indicator
  const savedGameIds = ref<Set<string>>(new Set())
  const pendingSaves = ref<Map<string, { timeoutId: number; score1?: number; score2?: number }>>(new Map())
  const queuedSaves = ref<Map<string, { score1?: number; score2?: number }>>(new Map())
  const retryMetadata = ref<Map<string, { count: number; timeoutId?: number }>>(new Map())

  function applyOptimistic(gameId: string, score1?: number, score2?: number) {
    if (!event.value) return
    const idx = event.value.games.findIndex((g) => g.id === gameId)
    if (idx !== -1) {
      event.value.games[idx] = {
        ...event.value.games[idx],
        scoreTeam1: score1,
        scoreTeam2: score2,
        result: getResultFromScores(score1, score2)
      }
    }
  }

  function flushPendingSave(gameId: string) {
    const pending = pendingSaves.value.get(gameId)
    if (pending) {
      clearTimeout(pending.timeoutId)
      pendingSaves.value.delete(gameId)
    }
  }

  async function performSave(gameId: string, score1?: number, score2?: number) {
    if (!event.value) return

    // One in-flight save per game: queue the newest scores if busy
    if (savingGameIds.value.has(gameId)) {
      queuedSaves.value.set(gameId, { score1, score2 })
      return
    }

    savingGameIds.value.add(gameId)

    try {
      const updated = await eventsApi.updateScore(gameId, {
        scoreTeam1: score1,
        scoreTeam2: score2
      })

      // Apply the server response only if nothing newer is queued, so the
      // UI doesn't flicker back to an older state.
      if (!queuedSaves.value.has(gameId)) {
        const idx = event.value.games.findIndex((g) => g.id === updated.id)
        if (idx !== -1) {
          event.value.games[idx] = updated
        }
        if (event.value.status === 'GENERATED') {
          event.value.status = 'IN_PROGRESS'
        }

        savedGameIds.value.add(gameId)
        setTimeout(() => savedGameIds.value.delete(gameId), 1500)
      }
    } catch (e: unknown) {
      const meta = retryMetadata.value.get(gameId) || { count: 0 }
      meta.count++
      retryMetadata.value.set(gameId, meta)

      if (queuedSaves.value.has(gameId) && meta.count < MAX_RETRIES) {
        // A retry with backoff is scheduled below — don't surface yet
        console.warn(`Save failed for game ${gameId}, retry ${meta.count}/${MAX_RETRIES}`)
      } else {
        const retryInfo = meta.count >= MAX_RETRIES ? ` (after ${meta.count} attempts)` : ''
        const message = (e as Error)?.message || 'Failed to save score'
        options.onError(message + retryInfo)
        retryMetadata.value.delete(gameId)
        queuedSaves.value.delete(gameId)
        await options.reload()
      }
    } finally {
      savingGameIds.value.delete(gameId)

      if (queuedSaves.value.has(gameId)) {
        const next = queuedSaves.value.get(gameId)
        queuedSaves.value.delete(gameId)

        const meta = retryMetadata.value.get(gameId) || { count: 0 }

        if (meta.count >= MAX_RETRIES) {
          console.error(`Max retries (${MAX_RETRIES}) exceeded for game ${gameId}`)
          retryMetadata.value.delete(gameId)
        } else {
          // Exponential backoff before running the queued save
          // (1s after a clean save, doubling per prior failure)
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, meta.count)
          if (meta.timeoutId) clearTimeout(meta.timeoutId)
          meta.timeoutId = window.setTimeout(() => {
            performSave(gameId, next?.score1, next?.score2)
          }, delay)
          retryMetadata.value.set(gameId, meta)
        }
      } else {
        retryMetadata.value.delete(gameId)
      }
    }
  }

  /** Optimistic update + debounced save (typing / stepper taps). */
  function debouncedSave(gameId: string, score1?: number, score2?: number) {
    if (!event.value) return
    applyOptimistic(gameId, score1, score2)
    flushPendingSave(gameId)
    const timeoutId = window.setTimeout(() => {
      pendingSaves.value.delete(gameId)
      performSave(gameId, score1, score2)
    }, DEBOUNCE_DELAY)
    pendingSaves.value.set(gameId, { timeoutId, score1, score2 })
  }

  /** Optimistic update + immediate save (blur / explicit save / next game). */
  async function saveNow(gameId: string, score1?: number, score2?: number) {
    if (!event.value) return
    flushPendingSave(gameId)
    applyOptimistic(gameId, score1, score2)
    await performSave(gameId, score1, score2)
  }

  onUnmounted(() => {
    // Flush pending debounced saves immediately so no entered score is lost
    pendingSaves.value.forEach((pending, gameId) => {
      clearTimeout(pending.timeoutId)
      performSave(gameId, pending.score1, pending.score2)
    })
    pendingSaves.value.clear()

    retryMetadata.value.forEach((meta) => {
      if (meta.timeoutId) clearTimeout(meta.timeoutId)
    })
    retryMetadata.value.clear()
    queuedSaves.value.clear()
  })

  return { savingGameIds, savedGameIds, debouncedSave, saveNow, flushPendingSave }
}
