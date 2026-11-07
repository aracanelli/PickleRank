import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import type { GroupDto, GroupPlayerDto } from '@/app/core/models/dto'
import { isOrganizerOf, myGroupPlayer } from '@/app/core/auth/groupRole'
import { useAuthStore } from './auth'

const LAST_KEY = 'lastGroupId'

function readLast(): string | null {
  try { return sessionStorage.getItem(LAST_KEY) } catch { return null }
}

/**
 * The league the user is working in: group, roster, and the user's role in it.
 * Remembers the last league so league navigation works on /events/:id, which has no groupId.
 */
export const useLeagueStore = defineStore('league', () => {
  const auth = useAuthStore()
  const groupId = ref<string | null>(readLast())
  const group = ref<GroupDto | null>(null)
  const players = ref<GroupPlayerDto[]>([])
  const loading = ref(false)
  const error = ref<{ status?: number; message: string } | null>(null)
  let pending: Promise<void> | null = null
  let pendingId: string | null = null

  const isOrganizer = computed(() => isOrganizerOf(group.value, players.value, auth.userId))
  const me = computed(() => myGroupPlayer(players.value, auth.userId))
  const trackPayments = computed(() => !!group.value?.settings.paymentSettings?.trackPayments)

  function remember(id: string) {
    groupId.value = id
    try { sessionStorage.setItem(LAST_KEY, id) } catch { /* ignore */ }
  }

  async function load(id: string, force = false) {
    if (!force && group.value?.id === id && !error.value) {
      remember(id)
      return
    }
    if (pending && pendingId === id && !force) return pending
    remember(id)
    loading.value = true
    error.value = null
    pendingId = id
    pending = (async () => {
      try {
        const [g, p] = await Promise.all([groupsApi.get(id), groupsApi.getPlayers(id)])
        if (pendingId !== id) return
        group.value = g
        players.value = p.players
      } catch (e) {
        if (pendingId !== id) return
        const err = e as { status?: number; message?: string }
        error.value = { status: err.status, message: err.message || 'Could not load this league' }
        group.value = null
        players.value = []
      } finally {
        if (pendingId === id) {
          loading.value = false
          pending = null
        }
      }
    })()
    return pending
  }

  function reset() {
    groupId.value = null
    group.value = null
    players.value = []
    error.value = null
    pendingId = null
  }

  watch(() => auth.userId, (next, prev) => {
    if (prev && next !== prev) reset()
  })

  return { groupId, group, players, loading, error, isOrganizer, me, trackPayments, load, remember, reset }
})
