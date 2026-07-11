import { ref, type Ref } from 'vue'
import { rankingsApi } from '../services/rankings.api'
import type { MatchHistoryEntryDto } from '@/app/core/models/dto'

const TTL_MS = 60_000
const DAYS_BACK = 30

// Module-level memo: one recent-history fetch per group serves the dashboard
// (streaks, feed, form chips) and any other consumer without a per-player
// fan-out. Bust on event completion / pull-to-refresh via bustGroupHistory.
const memo = new Map<string, { ts: number; data: MatchHistoryEntryDto[] }>()

export function bustGroupHistory(groupId?: string) {
  if (groupId) memo.delete(groupId)
  else memo.clear()
}

/**
 * Recent (last 30 days) match history for a group, memoized for 60s.
 * The history endpoint is unpaginated; the date bound keeps payloads sane.
 */
export function useGroupHistory(groupId: Ref<string>) {
  const matches = ref<MatchHistoryEntryDto[]>([])
  const isLoading = ref(false)
  const error = ref('')

  async function load(force = false) {
    const key = groupId.value
    const cached = memo.get(key)
    if (!force && cached && Date.now() - cached.ts < TTL_MS) {
      matches.value = cached.data
      return
    }
    isLoading.value = true
    error.value = ''
    try {
      const from = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      const response = await rankingsApi.getHistory(key, { from })
      matches.value = response.matches
      memo.set(key, { ts: Date.now(), data: response.matches })
    } catch (e) {
      error.value = (e as Error)?.message || 'Failed to load history'
    } finally {
      isLoading.value = false
    }
  }

  return { matches, isLoading, error, load }
}
