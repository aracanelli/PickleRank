import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type GroupRole = 'OWNER' | 'ORGANIZER' | 'PLAYER' | null

/**
 * The group the user is currently working inside. Group/event views populate
 * this on load; the app shell (contextual header, bottom tabs) and
 * permission-gated UI read from it. Replaces the old sessionStorage
 * `myPlayerId_<groupId>` mechanism.
 */
export const useGroupContextStore = defineStore('groupContext', () => {
  const groupId = ref<string | null>(null)
  const groupName = ref<string | null>(null)
  const myPlayerId = ref<string | null>(null)
  const role = ref<GroupRole>(null)

  const isActive = computed(() => groupId.value !== null)
  const canManage = computed(() => role.value === 'OWNER' || role.value === 'ORGANIZER')

  function setGroup(ctx: {
    groupId: string
    groupName?: string | null
    myPlayerId?: string | null
    role?: GroupRole
  }) {
    // Entering a different group resets player/role until the view provides them
    if (groupId.value !== ctx.groupId) {
      myPlayerId.value = null
      role.value = null
    }
    groupId.value = ctx.groupId
    if (ctx.groupName !== undefined) groupName.value = ctx.groupName
    if (ctx.myPlayerId !== undefined) myPlayerId.value = ctx.myPlayerId
    if (ctx.role !== undefined) role.value = ctx.role
  }

  function clear() {
    groupId.value = null
    groupName.value = null
    myPlayerId.value = null
    role.value = null
  }

  return { groupId, groupName, myPlayerId, role, isActive, canManage, setGroup, clear }
})
