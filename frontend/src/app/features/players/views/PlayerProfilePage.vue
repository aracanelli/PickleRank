<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TrendingUp, TrendingDown, History } from 'lucide-vue-next'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import type { PlayerStats } from '@/app/core/models/dto'
import { useAuthStore } from '@/stores/auth'
import { useGroupContextStore } from '@/stores/group-context'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import AppBadge from '@/app/core/ui/components/AppBadge.vue'
import StatTile from '@/app/core/ui/components/StatTile.vue'
import ListItem from '@/app/core/ui/components/ListItem.vue'
import RatingHistoryChart from '../components/RatingHistoryChart.vue'
import PlayerInsights from '../components/PlayerInsights.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()

const groupId = computed(() => route.params.groupId as string)
const playerId = computed(() => route.params.playerId as string)

const stats = ref<PlayerStats | null>(null)
const isLoading = ref(true)
const error = ref('')

onMounted(loadStats)

// Insights link to other player profiles on the same route — reload on change
watch(playerId, () => {
  if (playerId.value) loadStats()
})

async function loadStats() {
  isLoading.value = true
  error.value = ''
  try {
    stats.value = await groupsApi.getPlayerStats(groupId.value, playerId.value)
    syncGroupContext()
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load player stats')
  } finally {
    isLoading.value = false
  }
}

function syncGroupContext() {
  if (!stats.value) return
  const player = stats.value.player
  // If this profile IS the signed-in user's linked player, record it in context
  const isMe = !!player.userId && player.userId === authStore.userId
  groupContext.setGroup({
    groupId: groupId.value,
    ...(isMe ? { myPlayerId: player.id } : {})
  })
}

const isMyProfile = computed(
  () => !!stats.value?.player.userId && stats.value.player.userId === authStore.userId
)

const ratingDelta = computed(() => stats.value?.player.ratingDelta)

const record = computed(() => {
  const p = stats.value?.player
  if (!p) return ''
  return `${p.wins}-${p.losses}-${p.ties}`
})

const currentStreak = computed(() => {
  const adv = stats.value?.advanced
  if (!adv) return null
  if (adv.currentWinStreak > 0) return { value: `${adv.currentWinStreak}W`, tone: 'win' as const }
  if (adv.currentLossStreak > 0) return { value: `${adv.currentLossStreak}L`, tone: 'loss' as const }
  return { value: '—', tone: 'default' as const }
})

const skillLabel = computed(() => {
  const level = stats.value?.player.skillLevel
  if (!level) return null
  return level.charAt(0) + level.slice(1).toLowerCase()
})
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5">
    <SkeletonList v-if="isLoading" :rows="4" avatar />

    <ErrorState v-else-if="error" :message="error" @retry="loadStats" />

    <div v-else-if="stats" class="flex flex-col gap-5">
      <!-- Identity header -->
      <section class="flex items-center gap-4">
        <Avatar :name="stats.player.displayName" size="lg" :brand="isMyProfile" />
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-bold text-ink">{{ stats.player.displayName }}</h1>
          <div class="mt-1 flex flex-wrap items-center gap-1.5">
            <AppBadge :variant="stats.player.membershipType === 'SUB' ? 'warning' : 'brand'">
              {{ stats.player.membershipType === 'SUB' ? 'Sub' : 'Permanent' }}
            </AppBadge>
            <AppBadge v-if="stats.player.role === 'ORGANIZER'" variant="info">Organizer</AppBadge>
            <AppBadge v-if="skillLabel" variant="muted">{{ skillLabel }}</AppBadge>
          </div>
        </div>
        <div class="flex shrink-0 flex-col items-end">
          <span class="font-mono text-3xl font-bold tabular-nums text-ink">
            {{ stats.player.rating.toFixed(1) }}
          </span>
          <span
            v-if="ratingDelta"
            class="flex items-center gap-0.5 font-mono text-sm font-semibold tabular-nums"
            :class="ratingDelta > 0 ? 'text-win' : 'text-loss'"
          >
            <TrendingUp v-if="ratingDelta > 0" class="size-3.5" />
            <TrendingDown v-else class="size-3.5" />
            {{ ratingDelta > 0 ? '+' : '' }}{{ ratingDelta.toFixed(1) }}
          </span>
        </div>
      </section>

      <!-- Key stats -->
      <section class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Games" :value="stats.player.gamesPlayed" />
        <StatTile label="Record" :value="record" detail="W-L-T" />
        <StatTile label="Win rate" :value="`${(stats.player.winRate * 100).toFixed(0)}%`" tone="brand" />
        <StatTile
          v-if="currentStreak"
          label="Streak"
          :value="currentStreak.value"
          :tone="currentStreak.tone"
        />
      </section>

      <!-- Rating history chart -->
      <RatingHistoryChart v-if="stats.history.length > 0" :history="stats.history" :player-id="playerId" />

      <!-- Advanced insights -->
      <PlayerInsights v-if="stats.advanced" :advanced="stats.advanced" :group-id="groupId" />

      <!-- Match history link -->
      <section class="overflow-hidden rounded-xl border border-line bg-surface-1">
        <ListItem
          title="Match history"
          :subtitle="`All games played by ${stats.player.displayName}`"
          chevron
          @click="router.push(`/groups/${groupId}/history?playerId=${playerId}`)"
        >
          <template #leading><History class="size-5" /></template>
        </ListItem>
      </section>
    </div>
  </div>
</template>
