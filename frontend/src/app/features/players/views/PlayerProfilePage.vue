<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { History, Swords, Flame, Users } from 'lucide-vue-next'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { rankingsApi } from '@/app/features/rankings/services/rankings.api'
import type { PlayerStats, MatchHistoryEntryDto, TeammateStat } from '@/app/core/models/dto'
import { useAuthStore } from '@/stores/auth'
import { useGroupContextStore } from '@/stores/group-context'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import { computeFormGuide } from '../utils/form-guide'
import { sortNewestFirst } from '@/app/features/rankings/utils/match-derivations'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import StatTile from '@/app/core/ui/components/StatTile.vue'
import ListItem from '@/app/core/ui/components/ListItem.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import Sparkline from '@/app/core/ui/components/Sparkline.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import PlayerHeroCard from '../components/PlayerHeroCard.vue'
import RatingHistoryChart from '../components/RatingHistoryChart.vue'
import MatchCard from '@/app/features/rankings/components/MatchCard.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()

const groupId = computed(() => route.params.groupId as string)
// Route param is the GROUP-PLAYER id; the GLOBAL id lives on stats.player.playerId
const playerId = computed(() => route.params.playerId as string)

const stats = ref<PlayerStats | null>(null)
const isLoading = ref(true)
const error = ref('')

// One history fetch (filtered by GLOBAL player id) feeds BOTH the hero form
// guide and the recent-matches list below.
const historyMatches = ref<MatchHistoryEntryDto[]>([])

onMounted(loadStats)

// Insights link to other player profiles on the same route — reload on change
watch(playerId, () => {
  if (playerId.value) loadStats()
})

async function loadStats() {
  isLoading.value = true
  error.value = ''
  historyMatches.value = []
  try {
    stats.value = await groupsApi.getPlayerStats(groupId.value, playerId.value)
    syncGroupContext()
    // Non-blocking: the hero renders immediately, form dots + matches pop in
    void loadMatchHistory()
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load player stats')
  } finally {
    isLoading.value = false
  }
}

async function loadMatchHistory() {
  const globalPlayerId = stats.value?.player.playerId
  if (!globalPlayerId) return
  try {
    const response = await rankingsApi.getHistory(groupId.value, { playerId: globalPlayerId })
    historyMatches.value = response.matches
  } catch (e) {
    // Non-fatal: form guide + recent matches simply stay hidden
    console.error('Failed to load match history:', e)
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

// History team ids are GROUP-PLAYER ids — use stats.player.id here
const formGuide = computed(() =>
  stats.value ? computeFormGuide(historyMatches.value, stats.value.player.id) : []
)

const recentMatches = computed(() => sortNewestFirst(historyMatches.value).slice(0, 5))

// --- Stat grid ---------------------------------------------------------------

const record = computed(() => {
  const p = stats.value?.player
  if (!p) return ''
  return `${p.wins}-${p.losses}-${p.ties}`
})

const winPct = computed(() => {
  const p = stats.value?.player
  if (!p) return ''
  return `${(p.winRate * 100).toFixed(0)}%`
})

const currentStreak = computed(() => {
  const adv = stats.value?.advanced
  if (!adv) return null
  if (adv.currentWinStreak > 0) return { value: `W${adv.currentWinStreak}`, tone: 'win' as const }
  if (adv.currentLossStreak > 0) return { value: `L${adv.currentLossStreak}`, tone: 'loss' as const }
  return { value: '—', tone: 'default' as const }
})

// --- Rating sparkline ----------------------------------------------------------

const sparkPoints = computed(() => stats.value?.history.map((h) => h.rating) ?? [])
const sparkMin = computed(() =>
  sparkPoints.value.length > 0 ? Math.min(...sparkPoints.value) : null
)
const sparkMax = computed(() =>
  sparkPoints.value.length > 0 ? Math.max(...sparkPoints.value) : null
)

// --- Rivalries -----------------------------------------------------------------

// TeammateStat.playerId values ARE group-player ids — valid profile routes
function openPlayer(stat: TeammateStat) {
  router.push(`/groups/${groupId.value}/players/${stat.playerId}`)
}

function rivalRecord(stat: TeammateStat): string {
  return `${stat.wins}W–${stat.losses}L · ${stat.gamesPlayed} GP`
}

function teammateDetail(stat: TeammateStat): string {
  return `${(stat.winRate * 100).toFixed(0)}% win rate · ${stat.wins}W ${stat.losses}L · ${stat.gamesPlayed} GP`
}

// --- Navigation ------------------------------------------------------------------

function goCompare() {
  if (!stats.value) return
  // ?h2h expects the GLOBAL player id — pre-selects P1 in the H2H flow
  router.push(`/groups/${groupId.value}/history?h2h=${stats.value.player.playerId}`)
}

function goMatchHistory() {
  if (!stats.value) return
  // History filters use the GLOBAL player id, not the route's group-player id
  router.push(`/groups/${groupId.value}/history?playerId=${stats.value.player.playerId}`)
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5">
    <SkeletonList v-if="isLoading" :rows="4" avatar />

    <ErrorState v-else-if="error" :message="error" @retry="loadStats" />

    <div v-else-if="stats" class="flex flex-col gap-5">
      <!-- Trading-card hero -->
      <PlayerHeroCard :player="stats.player" :form="formGuide" :is-me="isMyProfile" />

      <!-- Stat grid -->
      <section class="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Games" :value="stats.player.gamesPlayed" />
        <StatTile label="Record" :value="record" detail="W-L-T" />
        <StatTile label="Win %" :value="winPct" tone="brand" />
        <template v-if="stats.advanced">
          <StatTile
            v-if="currentStreak"
            label="Current streak"
            :value="currentStreak.value"
            :tone="currentStreak.tone"
          />
          <StatTile label="Longest W streak" :value="`W${stats.advanced.longestWinStreak}`" />
          <StatTile label="Peak rating" :value="stats.advanced.highestRating.toFixed(1)" tone="brand" />
        </template>
      </section>

      <!-- Rating sparkline -->
      <section
        v-if="sparkPoints.length > 1"
        class="rounded-[14px] border border-line bg-surface-1 p-4"
      >
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="eyebrow text-ink-faint">Rating</h2>
          <span class="text-xs text-ink-faint">{{ sparkPoints.length }} events</span>
        </div>
        <Sparkline class="mt-2" :points="sparkPoints" :height="88" />
        <div class="mt-1 flex items-baseline justify-between">
          <span class="text-xs text-ink-faint">
            Low <span class="numeral text-sm text-ink">{{ sparkMin?.toFixed(1) }}</span>
          </span>
          <span class="text-xs text-ink-faint">
            High <span class="numeral text-sm text-ink">{{ sparkMax?.toFixed(1) }}</span>
          </span>
        </div>
      </section>

      <!-- Per-event drill-down chart (kept: already works and is themed) -->
      <section v-if="stats.history.length > 0" class="flex flex-col gap-2">
        <h2 class="eyebrow text-ink-faint">Event breakdown</h2>
        <RatingHistoryChart :history="stats.history" :player-id="playerId" />
      </section>

      <!-- Rivalries -->
      <section v-if="stats.advanced" class="flex flex-col gap-3">
        <h2 class="eyebrow text-ink-faint">Rivalries</h2>

        <div
          v-if="stats.advanced.nemesis || stats.advanced.pigeon"
          class="grid gap-3 md:grid-cols-2"
        >
          <!-- Nemesis -->
          <div
            v-if="stats.advanced.nemesis"
            class="rounded-[14px] border border-line bg-surface-1 p-4"
          >
            <TapeChip variant="loss">Nemesis</TapeChip>
            <button
              type="button"
              class="mt-3 flex w-full min-h-11 items-center gap-3 rounded-[10px] text-left transition-colors hover:bg-surface-2"
              @click="openPlayer(stats.advanced.nemesis)"
            >
              <Avatar
                :name="stats.advanced.nemesis.displayName"
                size="md"
                :seed="stats.advanced.nemesis.playerId"
              />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm font-semibold text-ink">
                  {{ stats.advanced.nemesis.displayName }}
                </span>
                <span class="truncate text-xs text-ink-faint">
                  {{ rivalRecord(stats.advanced.nemesis) }}
                </span>
              </span>
            </button>
            <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <div
                class="h-full rounded-full bg-loss"
                :style="{ width: `${Math.round(stats.advanced.nemesis.winRate * 100)}%` }"
              />
            </div>
            <p class="mt-1.5 text-xs text-ink-faint">
              You win {{ (stats.advanced.nemesis.winRate * 100).toFixed(0) }}% against them
            </p>
          </div>

          <!-- Pigeon -->
          <div
            v-if="stats.advanced.pigeon"
            class="rounded-[14px] border border-line bg-surface-1 p-4"
          >
            <TapeChip variant="win">Pigeon</TapeChip>
            <button
              type="button"
              class="mt-3 flex w-full min-h-11 items-center gap-3 rounded-[10px] text-left transition-colors hover:bg-surface-2"
              @click="openPlayer(stats.advanced.pigeon)"
            >
              <Avatar
                :name="stats.advanced.pigeon.displayName"
                size="md"
                :seed="stats.advanced.pigeon.playerId"
              />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm font-semibold text-ink">
                  {{ stats.advanced.pigeon.displayName }}
                </span>
                <span class="truncate text-xs text-ink-faint">
                  {{ rivalRecord(stats.advanced.pigeon) }}
                </span>
              </span>
            </button>
            <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <div
                class="h-full rounded-full bg-win"
                :style="{ width: `${Math.round(stats.advanced.pigeon.winRate * 100)}%` }"
              />
            </div>
            <p class="mt-1.5 text-xs text-ink-faint">
              You win {{ (stats.advanced.pigeon.winRate * 100).toFixed(0) }}% against them
            </p>
          </div>
        </div>

        <!-- Teammates -->
        <div class="grid gap-3 md:grid-cols-2">
          <div class="flex flex-col gap-2">
            <h3 class="flex items-center gap-1.5 eyebrow text-ink-faint">
              <Flame class="size-3.5" /> Best teammates
            </h3>
            <div class="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface-1">
              <ListItem
                v-for="tm in stats.advanced.bestTeammates"
                :key="tm.playerId"
                :title="tm.displayName"
                :subtitle="teammateDetail(tm)"
                chevron
                @click="openPlayer(tm)"
              >
                <template #leading><Avatar :name="tm.displayName" size="sm" :seed="tm.playerId" /></template>
                <template #trailing>
                  <span class="numeral text-sm text-win">{{ (tm.winRate * 100).toFixed(0) }}%</span>
                </template>
              </ListItem>
              <p
                v-if="stats.advanced.bestTeammates.length === 0"
                class="px-4 py-4 text-center text-sm text-ink-faint"
              >
                No data
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <h3 class="flex items-center gap-1.5 eyebrow text-ink-faint">
              <Users class="size-3.5" /> Worst teammates
            </h3>
            <div class="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface-1">
              <ListItem
                v-for="tm in stats.advanced.worstTeammates"
                :key="tm.playerId"
                :title="tm.displayName"
                :subtitle="teammateDetail(tm)"
                chevron
                @click="openPlayer(tm)"
              >
                <template #leading><Avatar :name="tm.displayName" size="sm" :seed="tm.playerId" /></template>
                <template #trailing>
                  <span class="numeral text-sm text-loss">{{ (tm.winRate * 100).toFixed(0) }}%</span>
                </template>
              </ListItem>
              <p
                v-if="stats.advanced.worstTeammates.length === 0"
                class="px-4 py-4 text-center text-sm text-ink-faint"
              >
                No data
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Compare head-to-head -->
      <AppButton variant="secondary" block @click="goCompare">
        <Swords class="size-4" />
        Compare head-to-head
      </AppButton>

      <!-- Recent matches -->
      <section v-if="recentMatches.length > 0" class="flex flex-col gap-2">
        <h2 class="eyebrow text-ink-faint">Recent matches</h2>
        <MatchCard
          v-for="match in recentMatches"
          :key="match.gameId"
          :match="match"
          show-caption
        />
      </section>

      <!-- Match history link -->
      <section class="overflow-hidden rounded-[14px] border border-line bg-surface-1">
        <ListItem
          title="Match history"
          :subtitle="`All games played by ${stats.player.displayName}`"
          chevron
          @click="goMatchHistory"
        >
          <template #leading><History class="size-5" /></template>
        </ListItem>
      </section>
    </div>
  </div>
</template>
