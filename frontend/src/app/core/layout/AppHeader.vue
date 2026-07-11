<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Activity, ChevronLeft, Home, Trophy, History, User, ClipboardList, Users } from 'lucide-vue-next'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import { useAuthStore } from '@/stores/auth'
import { useGroupContextStore } from '@/stores/group-context'

const props = defineProps<{
  context: 'global' | 'group'
}>()

const emit = defineEmits<{ account: [] }>()

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()

const groupId = computed(() => (route.params.groupId as string) || groupContext.groupId)

// Explicit back hierarchy (never history.back()):
// event/group sub-pages -> group home -> groups list
const backTarget = computed(() => {
  if (props.context !== 'group') return null
  if (route.name === 'group-detail') return '/groups'
  return groupId.value ? `/groups/${groupId.value}` : '/groups'
})

const title = computed(() => {
  const metaTitle = route.meta.title as string | undefined
  if (route.name === 'group-detail') return groupContext.groupName || 'Group'
  return metaTitle || groupContext.groupName || ''
})

// Desktop inline nav (bottom tabs are mobile-only)
const desktopNav = computed(() => {
  if (props.context === 'global') {
    return [
      { label: 'Groups', icon: ClipboardList, to: '/groups', active: route.path.startsWith('/groups') },
      { label: 'Players', icon: Users, to: '/players', active: route.path.startsWith('/players') }
    ]
  }
  const gid = groupId.value
  if (!gid) return []
  return [
    { label: 'Home', icon: Home, to: `/groups/${gid}`, active: route.name === 'group-detail' },
    { label: 'Rankings', icon: Trophy, to: `/groups/${gid}/rankings`, active: route.path.includes('/rankings') },
    { label: 'History', icon: History, to: `/groups/${gid}/history`, active: route.path.includes('/history') },
    ...(groupContext.myPlayerId
      ? [{
          label: 'Me',
          icon: User,
          to: `/groups/${gid}/players/${groupContext.myPlayerId}`,
          active: route.params.playerId === groupContext.myPlayerId
        }]
      : [])
  ]
})
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-line bg-surface-page/90 backdrop-blur-md pt-safe">
    <div class="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-2 md:px-6">
      <!-- Left: logo (global) or back + title (group context) -->
      <template v-if="context === 'global'">
        <RouterLink to="/groups" class="flex items-center gap-2 px-2 font-bold text-ink">
          <Activity class="size-5 text-brand" aria-hidden="true" />
          <span class="text-lg">PickleRank</span>
        </RouterLink>
      </template>
      <template v-else>
        <button
          type="button"
          class="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink active:scale-95"
          aria-label="Back"
          @click="backTarget && router.push(backTarget)"
        >
          <ChevronLeft class="size-6" />
        </button>
        <h1 class="min-w-0 flex-1 truncate text-lg font-semibold text-ink md:flex-none">{{ title }}</h1>
      </template>

      <!-- Desktop nav -->
      <nav class="ml-4 hidden flex-1 items-center gap-1 md:flex" aria-label="Primary">
        <RouterLink
          v-for="item in desktopNav"
          :key="item.label"
          :to="item.to"
          class="flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors"
          :class="item.active ? 'bg-brand-soft text-brand' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
        >
          <component :is="item.icon" class="size-4" aria-hidden="true" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="flex-1 md:hidden" v-if="context === 'global'" />

      <!-- Page-specific actions (views teleport into this) -->
      <div id="header-actions" class="flex items-center gap-1" />

      <!-- Account -->
      <button
        type="button"
        class="ml-1 flex min-h-11 min-w-11 items-center justify-center rounded-full transition-transform active:scale-95"
        :class="context === 'group' ? 'hidden md:flex' : ''"
        aria-label="Account"
        @click="emit('account')"
      >
        <Avatar :name="authStore.userName || '?'" brand />
      </button>
    </div>
  </header>
</template>
