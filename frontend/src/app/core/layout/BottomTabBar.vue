<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Home, Trophy, History, User, ClipboardList, Users, CircleUserRound } from 'lucide-vue-next'
import { useGroupContextStore } from '@/stores/group-context'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  /** 'global' (Groups/Players/Account) or 'group' (Home/Rankings/History/Me) */
  context: 'global' | 'group'
}>()

const emit = defineEmits<{ account: [] }>()

const route = useRoute()
const router = useRouter()
const groupContext = useGroupContextStore()
const authStore = useAuthStore()

const groupId = computed(() => (route.params.groupId as string) || groupContext.groupId)

const active = computed(() => {
  const path = route.path
  if (props.context === 'global') {
    if (path.startsWith('/players')) return 'players'
    return 'groups'
  }
  if (path.includes('/rankings')) return 'rankings'
  if (path.includes('/history')) return 'history'
  if (path.match(/\/players\/[^/]+$/) && route.params.playerId === groupContext.myPlayerId) return 'me'
  return 'home'
})

async function goToMe() {
  const gid = groupId.value
  if (!gid) return
  if (groupContext.myPlayerId) {
    router.push(`/groups/${gid}/players/${groupContext.myPlayerId}`)
    return
  }
  // Not cached yet: look up the player linked to this user
  try {
    const { groupsApi } = await import('@/app/features/groups/services/groups.api')
    const response = await groupsApi.getPlayers(gid)
    const myPlayer = response.players.find((p) => p.userId === authStore.userId)
    if (myPlayer) {
      groupContext.setGroup({ groupId: gid, myPlayerId: myPlayer.id })
      router.push(`/groups/${gid}/players/${myPlayer.id}`)
    } else {
      router.push(`/groups/${gid}/rankings`)
    }
  } catch {
    router.push(`/groups/${gid}/rankings`)
  }
}

interface Tab {
  key: string
  label: string
  icon: unknown
  action: () => void
}

const tabs = computed<Tab[]>(() => {
  if (props.context === 'global') {
    return [
      { key: 'groups', label: 'Groups', icon: ClipboardList, action: () => router.push('/groups') },
      { key: 'players', label: 'Players', icon: Users, action: () => router.push('/players') },
      { key: 'account', label: 'Account', icon: CircleUserRound, action: () => emit('account') }
    ]
  }
  const gid = groupId.value
  return [
    { key: 'home', label: 'Home', icon: Home, action: () => gid && router.push(`/groups/${gid}`) },
    { key: 'rankings', label: 'Rankings', icon: Trophy, action: () => gid && router.push(`/groups/${gid}/rankings`) },
    { key: 'history', label: 'History', icon: History, action: () => gid && router.push(`/groups/${gid}/history`) },
    { key: 'me', label: 'Me', icon: User, action: goToMe }
  ]
})
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-1/95 backdrop-blur-md pb-safe md:hidden"
    aria-label="Primary"
  >
    <div class="flex items-stretch">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 transition-colors active:scale-95"
        :class="active === tab.key ? 'text-brand' : 'text-ink-faint'"
        :aria-current="active === tab.key ? 'page' : undefined"
        @click="tab.action()"
      >
        <component :is="tab.icon" class="size-5" aria-hidden="true" />
        <span class="text-[0.65rem] font-semibold uppercase tracking-wide">{{ tab.label }}</span>
      </button>
    </div>
  </nav>
</template>
