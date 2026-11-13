import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import type { GroupDto, GroupPlayerDto } from '@/app/core/models/dto'
import { isOrganizerOf, myGroupPlayer } from '@/app/core/auth/groupRole'
import { useAuthStore } from './auth'
import { api } from '@/app/core/http/api-client'
import { outbox } from '@/app/core/offline/sync'

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
    error.value = null
    pendingId = id
    // Last copy kept on this device paints the league at once (and offline); fresh data follows.
    if (group.value?.id !== id) {
      group.value = null
      players.value = []
    }
    let keptGroup: GroupDto | null = null
    let keptPlayers: GroupPlayerDto[] | null = null
    const showKept = () => {
      if (pendingId !== id || !keptGroup || !keptPlayers || group.value?.id === id) return
      group.value = keptGroup
      players.value = keptPlayers
    }
    const request = Promise.all([
      groupsApi.get(id, g => { keptGroup = g; showKept() }),
      groupsApi.getPlayers(id, p => { keptPlayers = p.players; showKept() })
    ])
    loading.value = group.value?.id !== id
    pending = (async () => {
      try {
        const [g, p] = await request
        if (pendingId !== id) return
        group.value = g
        players.value = p.players
      } catch (e) {
        if (pendingId !== id) return
        const err = e as { status?: number; message?: string; offline?: boolean }
        // Offline (or a league created on this phone that the server doesn't have yet): keep the
        // kept copy. Gone or no longer visible (403/404): drop it and show why.
        if (group.value?.id === id && (err.offline || outbox.find(`group-create:${id}`))) return
        if (err.status === 403 || err.status === 404) {
          api.forget(`/api/groups/${id}`)
          api.forget(`/api/groups/${id}/players`)
        }
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
