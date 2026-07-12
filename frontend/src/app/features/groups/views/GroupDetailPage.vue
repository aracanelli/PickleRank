<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Plus, CalendarDays, UserPlus } from 'lucide-vue-next'
import { groupsApi } from '../services/groups.api'
import { eventsApi } from '@/app/features/events/services/events.api'
import { rankingsApi } from '@/app/features/rankings/services/rankings.api'
import { paymentsApi } from '@/app/features/payments/services/payments.api'
import { awardsApi } from '@/app/features/awards/services/awards.api'
import { api } from '@/app/core/http/api-client'
import type { GroupDto, EventListItemDto, RankingEntryDto, AwardEditionDto } from '@/app/core/models/dto'
import { useAuthStore } from '@/stores/auth'
import { useGroupContextStore, type GroupRole } from '@/stores/group-context'
import { useToast } from '@/app/core/ui/composables/useToast'
import { useConfirm } from '@/app/core/ui/composables/useConfirm'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import { usePlayerIndex } from '@/app/features/players/composables/usePlayerIndex'
import { useGroupHistory, bustGroupHistory } from '@/app/features/rankings/composables/useGroupHistory'
import { hotAndCold, groupByEvent } from '@/app/features/rankings/utils/match-derivations'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import Skeleton from '@/app/core/ui/components/Skeleton.vue'
import SegmentedControl from '@/app/core/ui/components/SegmentedControl.vue'
import Fab from '@/app/core/ui/components/Fab.vue'
import PullRefresh from '@/app/core/ui/components/PullRefresh.vue'
import CourtLines from '@/app/core/ui/components/CourtLines.vue'
import EventCard from '../components/EventCard.vue'
import ImportHistorySheet from '../components/ImportHistorySheet.vue'
import HeroEventCard from '../components/dashboard/HeroEventCard.vue'
import PodiumStrip from '../components/dashboard/PodiumStrip.vue'
import HotColdRow from '../components/dashboard/HotColdRow.vue'
import RecentResults from '../components/dashboard/RecentResults.vue'
import AdminStrip from '../components/dashboard/AdminStrip.vue'
import AwardsTeaser from '../components/dashboard/AwardsTeaser.vue'
import type { PodiumItem } from '../components/dashboard/types'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()
const toast = useToast()
const { confirm } = useConfirm()

const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const events = ref<EventListItemDto[]>([])
const rankings = ref<RankingEntryDto[]>([])
const awardsEdition = ref<AwardEditionDto | null>(null)
const totalOwed = ref<number | null>(null)
const isLoading = ref(true)
const error = ref('')
const statusFilter = ref('all')
const showImportSheet = ref(false)

const playerIndex = usePlayerIndex(groupId)
const history = useGroupHistory(groupId)

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Done', value: 'done' }
]

onMounted(loadAll)

async function loadAll(silent = false) {
  if (!silent) isLoading.value = true
  error.value = ''
  try {
    // Events failing shouldn't take down the whole page (ported behavior)
    const [groupRes, , eventsRes] = await Promise.all([
      groupsApi.get(groupId.value),
      playerIndex.load(),
      eventsApi.list(groupId.value).catch((e) => {
        console.error('Failed to load events:', e)
        return { events: [] as EventListItemDto[] }
      })
    ])
    // usePlayerIndex swallows its own errors; players are load-bearing here
    if (playerIndex.error.value) throw new Error(playerIndex.error.value)
    group.value = groupRes
    events.value = eventsRes.events
    syncGroupContext()
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load group')
    isLoading.value = false
    return
  }
  isLoading.value = false
  // Dashboard extras are all fail-soft: their sections simply hide.
  await loadDashboardExtras()
}

async function loadDashboardExtras() {
  await Promise.all([
    history.load(),
    rankingsApi
      .getRankings(groupId.value)
      .then((res) => (rankings.value = res.rankings))
      .catch((e) => console.error('Failed to load rankings:', e)),
    // Awards teaser is fail-soft: hide the card if the lookup fails.
    awardsApi
      .getAwards(groupId.value)
      .then((res) => (awardsEdition.value = res))
      .catch((e) => console.error('Failed to load awards:', e)),
    loadPaymentsBadge()
  ])
}

async function loadPaymentsBadge() {
  totalOwed.value = null
  if (!canManage.value || !trackPayments.value) return
  try {
    totalOwed.value = (await paymentsApi.getBalances(groupId.value)).totalOwed
  } catch (e) {
    console.error('Failed to load payment balances:', e)
  }
}

function syncGroupContext() {
  if (!group.value) return
  const userId = authStore.userId
  const myPlayer = playerIndex.players.value.find((p) => p.userId && p.userId === userId) || null
  let role: GroupRole = null
  if (userId && group.value.ownerUserId === userId) role = 'OWNER'
  else if (myPlayer) role = myPlayer.role
  groupContext.setGroup({
    groupId: groupId.value,
    groupName: group.value.name,
    myPlayerId: myPlayer?.id ?? null,
    role
  })
}

const canManage = computed(() => groupContext.canManage)

const permanentPlayers = computed(() =>
  playerIndex.players.value.filter((p) => p.membershipType === 'PERMANENT')
)

const trackPayments = computed(() => !!group.value?.settings.paymentSettings?.trackPayments)
const currency = computed(() => group.value?.settings.paymentSettings?.currency || 'USD')

const mastheadEyebrow = computed(() => {
  const sport = group.value?.sport || 'Pickleball'
  const count = playerIndex.players.value.length
  return `${sport} · ${count} ${count === 1 ? 'player' : 'players'}`
})

// --- Hero event: live beats scheduled beats empty ---------------------------

const liveEvent = computed(() => events.value.find((e) => e.status === 'IN_PROGRESS') ?? null)

const nextEvent = computed(() => {
  const pending = events.value.filter((e) => e.status === 'DRAFT' || e.status === 'GENERATED')
  if (pending.length === 0) return null
  const now = Date.now()
  const startsAtMs = (e: EventListItemDto) => (e.startsAt ? new Date(e.startsAt).getTime() : NaN)
  const future = pending
    .filter((e) => startsAtMs(e) >= now)
    .sort((a, b) => startsAtMs(a) - startsAtMs(b))
  if (future.length > 0) return future[0]
  // Fallback: newest non-completed (undated events keep list order)
  return [...pending].sort((a, b) => (startsAtMs(b) || 0) - (startsAtMs(a) || 0))[0]
})

const heroEvent = computed(() => liveEvent.value ?? nextEvent.value)

function openHeroEvent() {
  const event = heroEvent.value
  if (!event) return
  router.push(
    event.status === 'IN_PROGRESS' ? `/events/${event.id}?mode=live` : `/events/${event.id}`
  )
}

// --- Podium / streaks / feed derivations ------------------------------------

const podiumItems = computed<PodiumItem[]>(() => {
  const ranked = rankings.value
    .filter((r) => r.gamesPlayed > 0)
    // Permanent regulars only — subs don't belong on the club podium.
    // Unknown/unmapped counts as permanent, matching the Ladder filter.
    .filter((r) => playerIndex.byGlobalPlayerId.value.get(r.playerId)?.membershipType !== 'SUB')
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3)
  if (ranked.length < 3) return []
  // Re-rank 1·2·3 so medals stay contiguous after subs are removed
  return ranked.map((r, index) => ({
    rank: index + 1,
    playerId: r.playerId,
    groupPlayerId: playerIndex.toGroupPlayerId(r.playerId),
    name: r.displayName,
    rating: r.rating,
    delta: playerIndex.byGlobalPlayerId.value.get(r.playerId)?.ratingDelta
  }))
})

const streaks = computed(() =>
  hotAndCold(history.matches.value, playerIndex.namesByGroupPlayerId.value)
)

const recentMatches = computed(() =>
  groupByEvent(history.matches.value)
    .flatMap((g) => g.matches)
    .slice(0, 3)
)

// --- Events list (ported) ----------------------------------------------------

const filteredEvents = computed(() => {
  if (statusFilter.value === 'active') return events.value.filter((e) => e.status !== 'COMPLETED')
  if (statusFilter.value === 'done') return events.value.filter((e) => e.status === 'COMPLETED')
  return events.value
})

async function reloadEvents() {
  try {
    events.value = (await eventsApi.list(groupId.value)).events
  } catch (e) {
    console.error('Failed to load events:', e)
  }
}

async function onHistoryImported() {
  bustGroupHistory(groupId.value)
  await Promise.all([reloadEvents(), loadDashboardExtras()])
}

async function deleteEvent(event: EventListItemDto) {
  const ok = await confirm({
    title: 'Delete event?',
    message: `Delete event "${event.name || 'Unnamed event'}"? This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return
  try {
    await eventsApi.delete(event.id)
    toast.success('Event deleted')
    await reloadEvents()
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to delete event'))
  }
}

async function refresh() {
  api.invalidateCache(`/api/groups/${groupId.value}`)
  api.invalidateCache(`/api/groups/${groupId.value}/players`)
  api.invalidateCache(`/api/groups/${groupId.value}/rankings`)
  bustGroupHistory(groupId.value)
  await loadAll(true)
}
</script>

<template>
  <PullRefresh :on-refresh="refresh">
    <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5">
      <!-- Skeletons sized like the dashboard: masthead, hero, podium, rows -->
      <div v-if="isLoading || !authStore.isInitialized" class="flex flex-col gap-5">
        <div class="flex flex-col gap-2">
          <Skeleton class="h-3 w-40" />
          <Skeleton class="h-9 w-2/3" />
        </div>
        <Skeleton class="h-44 rounded-[20px]" />
        <div class="grid grid-cols-3 items-end gap-2">
          <Skeleton class="h-36" />
          <Skeleton class="h-44" />
          <Skeleton class="h-36" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <Skeleton class="h-24" />
          <Skeleton class="h-24" />
        </div>
      </div>

      <ErrorState v-else-if="error" :message="error" @retry="loadAll()" />

      <div v-else-if="group" class="flex flex-col gap-5">
        <!-- Masthead: broadcast title block, not a card -->
        <header class="stadium-glow relative overflow-hidden">
          <CourtLines crop="corner" class="absolute -right-2 -top-3 h-28 w-auto" />
          <p class="eyebrow relative text-ink-faint">{{ mastheadEyebrow }}</p>
          <h1 class="display-wide relative mt-1 min-w-0 break-words text-2xl leading-tight text-ink md:text-4xl">
            {{ group.name }}
          </h1>
          <div class="kitchen-line relative mt-3" />
        </header>

        <!-- Awards headline the dashboard once they exist -->
        <AwardsTeaser v-if="awardsEdition" :group-id="groupId" :edition="awardsEdition" />

        <AppEmptyState
          v-if="canManage && permanentPlayers.length === 0"
          title="No permanent players yet"
          description="Add permanent players to your group to start creating events."
        >
          <template #icon><UserPlus class="size-7" /></template>
          <template #action>
            <AppButton @click="router.push(`/groups/${groupId}/players/manage`)">
              Manage players
            </AppButton>
          </template>
        </AppEmptyState>

        <HeroEventCard v-if="heroEvent" :event="heroEvent" @open="openHeroEvent" />

        <PodiumStrip v-if="podiumItems.length" :items="podiumItems" :group-id="groupId" />

        <HotColdRow :hot="streaks.hot" :cold="streaks.cold" :group-id="groupId" />

        <RecentResults :matches="recentMatches" :group-id="groupId" />

        <AdminStrip
          v-if="canManage"
          :group-id="groupId"
          :track-payments="trackPayments"
          :total-owed="totalOwed"
          :currency="currency"
          @import="showImportSheet = true"
        />

        <!-- All events (ported filter + list) -->
        <section class="flex flex-col gap-3">
          <h2 class="eyebrow text-ink-faint">All events</h2>
          <SegmentedControl v-model="statusFilter" :options="statusOptions" />

          <AppEmptyState
            v-if="filteredEvents.length === 0"
            :title="statusFilter === 'all' ? 'No events yet' : 'No events here'"
            :description="
              statusFilter === 'done'
                ? 'Completed events will show up here.'
                : 'Create a new event to start organizing games.'
            "
            court
          >
            <template #icon><CalendarDays class="size-7" /></template>
            <template v-if="canManage && statusFilter !== 'done'" #action>
              <AppButton @click="router.push(`/groups/${groupId}/events/new`)">
                <Plus class="size-4" />
                Create event
              </AppButton>
            </template>
          </AppEmptyState>

          <div v-else class="flex flex-col gap-2">
            <EventCard
              v-for="event in filteredEvents"
              :key="event.id"
              :event="event"
              :deletable="canManage && event.status !== 'COMPLETED'"
              @click="router.push(`/events/${event.id}`)"
              @delete="deleteEvent(event)"
            />
          </div>
        </section>
      </div>
    </div>
  </PullRefresh>

  <Fab v-if="canManage" label="New event" @click="router.push(`/groups/${groupId}/events/new`)">
    <Plus class="size-5" />
  </Fab>

  <ImportHistorySheet v-model="showImportSheet" :group-id="groupId" @imported="onHistoryImported" />
</template>
