import { ref, computed, type Ref } from 'vue'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import type { GroupPlayerDto } from '@/app/core/models/dto'

/**
 * ID mapping for a group's players. Two id spaces exist and MUST NOT be
 * mixed: rankings/history filters use the GLOBAL player id
 * (GroupPlayerDto.playerId); profile routes and history team ids use the
 * GROUP-PLAYER id (GroupPlayerDto.id). Route every client-side computation
 * through this index.
 */
export function usePlayerIndex(groupId: Ref<string>) {
  const players = ref<GroupPlayerDto[]>([])
  const isLoading = ref(false)
  const error = ref('')

  const byGroupPlayerId = computed(() => {
    const map = new Map<string, GroupPlayerDto>()
    players.value.forEach((p) => map.set(p.id, p))
    return map
  })

  const byGlobalPlayerId = computed(() => {
    const map = new Map<string, GroupPlayerDto>()
    players.value.forEach((p) => map.set(p.playerId, p))
    return map
  })

  /** group-player id -> display name (for match-derivation helpers) */
  const namesByGroupPlayerId = computed(() => {
    const map = new Map<string, string>()
    players.value.forEach((p) => map.set(p.id, p.displayName))
    return map
  })

  function toGroupPlayerId(globalPlayerId: string): string | undefined {
    return byGlobalPlayerId.value.get(globalPlayerId)?.id
  }

  function toGlobalPlayerId(groupPlayerId: string): string | undefined {
    return byGroupPlayerId.value.get(groupPlayerId)?.playerId
  }

  async function load() {
    isLoading.value = true
    error.value = ''
    try {
      const response = await groupsApi.getPlayers(groupId.value)
      players.value = response.players
    } catch (e) {
      error.value = (e as Error)?.message || 'Failed to load players'
    } finally {
      isLoading.value = false
    }
  }

  return {
    players,
    isLoading,
    error,
    byGroupPlayerId,
    byGlobalPlayerId,
    namesByGroupPlayerId,
    toGroupPlayerId,
    toGlobalPlayerId,
    load
  }
}
