<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ChartColumn, SlidersHorizontal, Settings2, X, AlertTriangle } from 'lucide-vue-next'
import { rankingsApi } from '../services/rankings.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { eventsApi } from '@/app/features/events/services/events.api'
import { api } from '@/app/core/http/api-client'
import type { MatchHistoryEntryDto, GroupDto, GroupPlayerDto, EventListItemDto } from '@/app/core/models/dto'
import { useAuthStore } from '@/stores/auth'
import { useGroupContextStore, type GroupRole } from '@/stores/group-context'
import { useToast } from '@/app/core/ui/composables/useToast'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import PullRefresh from '@/app/core/ui/components/PullRefresh.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import MatchCard from '../components/MatchCard.vue'
import FilterSheet, { emptyFilters, type HistoryFilters } from '../components/FilterSheet.vue'
import EventEditSheet, { type EventEditData } from '../components/EventEditSheet.vue'

const route = useRoute()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()
const toast = useToast()

const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const players = ref<GroupPlayerDto[]>([])
const events = ref<EventListItemDto[]>([])
const matches = ref<MatchHistoryEntryDto[]>([])
const isLoading = ref(true)
const error = ref('')

// Applied filters (edited via FilterSheet)
const filters = ref<HistoryFilters>(emptyFilters())
const showFilterSheet = ref(false)

const canManage = computed(() => groupContext.canManage)

onMounted(async () => {
  await Promise.all([loadGroup(), loadPlayers(), loadEvents()])
  syncGroupContext()

  // Check for playerId query param first, else auto-filter by the signed-in
  // user's linked player (ported legacy behavior)
  const queryPlayerId = route.query.playerId as string | undefined
  if (queryPlayerId) {
    filters.value.playerId = queryPlayerId
  } else if (authStore.userId) {
    const myPlayer = players.value.find((p) => p.userId === authStore.userId)
    if (myPlayer) filters.value.playerId = myPlayer.playerId
  }

  await loadHistory()
})

function syncGroupContext() {
  if (!group.value) return
  const userId = authStore.userId
  const myPlayer = players.value.find((p) => p.userId && p.userId === userId) || null
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

async function loadGroup() {
  try {
    group.value = await groupsApi.get(groupId.value)
  } catch (e) {
    error.value = getApiErrorMessage(e)
  }
}

async function loadPlayers() {
  try {
    players.value = (await groupsApi.getPlayers(groupId.value)).players
  } catch (e) {
    console.error('Failed to load players:', e)
  }
}

async function loadEvents() {
  try {
    events.value = (await eventsApi.list(groupId.value, 'COMPLETED')).events
  } catch (e) {
    console.error('Failed to load events:', e)
  }
}

async function loadHistory() {
  isLoading.value = true
  error.value = ''
  try {
    const options: {
      from?: string
      to?: string
      playerId?: string
      eventId?: string
      secondaryPlayerId?: string
      relationship?: 'teammate' | 'opponent'
    } = {}

    if (filters.value.from) options.from = filters.value.from
    if (filters.value.to) options.to = filters.value.to
    if (filters.value.playerId) {
      options.playerId = filters.value.playerId
      // Secondary filter only applies if primary is selected
      if (filters.value.secondaryPlayerId) {
        options.secondaryPlayerId = filters.value.secondaryPlayerId
        options.relationship = filters.value.relationship
      }
    }
    if (filters.value.eventId) options.eventId = filters.value.eventId

    const response = await rankingsApi.getHistory(groupId.value, options)
    matches.value = response.matches
    visibleEventCount.value = PAGE_SIZE
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load history')
  } finally {
    isLoading.value = false
  }
}

function applyFilters(next: HistoryFilters) {
  filters.value = next
  loadHistory()
}

// --- Filter chips -----------------------------------------------------------

function playerName(playerId: string): string {
  return players.value.find((p) => p.playerId === playerId)?.displayName || 'Player'
}

function eventLabel(eventId: string): string {
  const event = events.value.find((e) => e.id === eventId)
  if (!event) return 'Event'
  return event.name || (event.startsAt ? new Date(event.startsAt).toLocaleDateString() : 'Event')
}

interface FilterChip {
  key: string
  label: string
  remove: () => void
}

const filterChips = computed<FilterChip[]>(() => {
  const chips: FilterChip[] = []
  const f = filters.value
  if (f.from) {
    chips.push({ key: 'from', label: `From ${f.from}`, remove: () => { filters.value.from = ''; loadHistory() } })
  }
  if (f.to) {
    chips.push({ key: 'to', label: `To ${f.to}`, remove: () => { filters.value.to = ''; loadHistory() } })
  }
  if (f.eventId) {
    chips.push({ key: 'event', label: eventLabel(f.eventId), remove: () => { filters.value.eventId = ''; loadHistory() } })
  }
  if (f.playerId) {
    chips.push({
      key: 'player',
      label: playerName(f.playerId),
      remove: () => {
        // Clearing the primary player also clears the secondary (legacy semantics)
        filters.value.playerId = ''
        filters.value.secondaryPlayerId = ''
        filters.value.relationship = 'teammate'
        loadHistory()
      }
    })
    if (f.secondaryPlayerId) {
      chips.push({
        key: 'secondary',
        label: `${f.relationship === 'teammate' ? 'With' : 'Vs'} ${playerName(f.secondaryPlayerId)}`,
        remove: () => {
          filters.value.secondaryPlayerId = ''
          filters.value.relationship = 'teammate'
          loadHistory()
        }
      })
    }
  }
  return chips
})

const activeFilterCount = computed(() => filterChips.value.length)

// --- Grouping by event (newest first) + client-side "Load more" -------------

const PAGE_SIZE = 5
const visibleEventCount = ref(PAGE_SIZE)

const matchesByEvent = computed(() => {
  const eventsMap = new Map<string, { id: string; name: string; date: string; matches: MatchHistoryEntryDto[] }>()
  for (const match of matches.value) {
    if (!eventsMap.has(match.eventId)) {
      eventsMap.set(match.eventId, {
        id: match.eventId,
        name: match.eventName || 'Event',
        date: match.date,
        matches: []
      })
    }
    eventsMap.get(match.eventId)!.matches.push(match)
  }
  return Array.from(eventsMap.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
})

const visibleEvents = computed(() => matchesByEvent.value.slice(0, visibleEventCount.value))
const hasMore = computed(() => matchesByEvent.value.length > visibleEventCount.value)

function loadMore() {
  visibleEventCount.value += PAGE_SIZE
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// --- Per-game quick score edit (ported legacy edit modal) --------------------

const showEditSheet = ref(false)
const editingMatch = ref<MatchHistoryEntryDto | null>(null)
const editScore1 = ref<number | undefined>(undefined)
const editScore2 = ref<number | undefined>(undefined)
const isSavingEdit = ref(false)

function openEditMatch(match: MatchHistoryEntryDto) {
  editingMatch.value = match
  editScore1.value = match.scoreTeam1
  editScore2.value = match.scoreTeam2
  showEditSheet.value = true
}

function parseScoreInput(value: string): number | undefined {
  if (value === '') return undefined
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

async function saveMatchEdit() {
  if (!editingMatch.value) return
  isSavingEdit.value = true
  try {
    await eventsApi.updateScore(editingMatch.value.gameId, {
      scoreTeam1: editScore1.value,
      scoreTeam2: editScore2.value
    })
    showEditSheet.value = false
    toast.success('Score updated')
    await loadHistory()
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to update score'))
  } finally {
    isSavingEdit.value = false
  }
}

// --- Event edit sheet (batch editing of a whole event) -----------------------

const showEventEditSheet = ref(false)
const editingEvent = ref<EventEditData | null>(null)

async function openEventEdit(event: { id: string; name: string; date: string }) {
  try {
    // Fetch full event data to get ALL games, not just filtered ones
    const fullEvent = await eventsApi.get(event.id)

    const allMatches: MatchHistoryEntryDto[] = fullEvent.games.map((game) => ({
      gameId: game.id,
      eventId: fullEvent.id,
      eventName: fullEvent.name,
      date: fullEvent.startsAt || event.date,
      roundIndex: game.roundIndex,
      courtIndex: game.courtIndex,
      team1: game.team1.map((p) => p.displayName),
      team2: game.team2.map((p) => p.displayName),
      team1Ids: game.team1.map((p) => p.id),
      team2Ids: game.team2.map((p) => p.id),
      scoreTeam1: game.scoreTeam1,
      scoreTeam2: game.scoreTeam2,
      result: game.result,
      team1Elo: game.team1Elo,
      team2Elo: game.team2Elo
    }))

    editingEvent.value = { id: event.id, name: event.name, date: event.date, matches: allMatches }
    showEventEditSheet.value = true
  } catch (e) {
    console.error('Failed to load event for editing:', e)
    toast.error(getApiErrorMessage(e, 'Failed to load event'))
  }
}

function handleEventEditSaved() {
  loadHistory()
}

// --- Pull-to-refresh ---------------------------------------------------------

async function refreshData() {
  api.invalidateCache(`/api/groups/${groupId.value}/history`)
  await loadHistory()
}
</script>

<template>
  <PullRefresh :on-refresh="refreshData">
    <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5">
      <div class="flex flex-col gap-4">
        <!-- Filter button + applied chips -->
        <div class="flex flex-wrap items-center gap-2">
          <AppButton variant="secondary" size="sm" @click="showFilterSheet = true">
            <SlidersHorizontal class="size-4" />
            Filters
            <span
              v-if="activeFilterCount > 0"
              class="flex size-5 items-center justify-center rounded-full bg-brand font-mono text-xs font-bold tabular-nums text-brand-contrast"
            >
              {{ activeFilterCount }}
            </span>
          </AppButton>

          <button
            v-for="chip in filterChips"
            :key="chip.key"
            type="button"
            class="flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface-1 px-3 text-sm text-ink transition-colors hover:bg-surface-2"
            :aria-label="`Remove filter: ${chip.label}`"
            @click="chip.remove()"
          >
            {{ chip.label }}
            <X class="size-3.5 text-ink-faint" />
          </button>
        </div>

        <SkeletonList v-if="isLoading" :rows="4" />

        <ErrorState v-else-if="error" :message="error" @retry="loadHistory" />

        <AppEmptyState
          v-else-if="matches.length === 0"
          title="No match history yet"
          :description="
            activeFilterCount > 0
              ? 'No matches found for the selected filters.'
              : 'Complete some events to see match history here.'
          "
        >
          <template #icon><ChartColumn class="size-7" /></template>
        </AppEmptyState>

        <template v-else>
          <section v-for="event in visibleEvents" :key="event.id" class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-3 border-b border-line pb-2">
              <div class="min-w-0">
                <h2 class="truncate text-base font-semibold text-ink">{{ event.name }}</h2>
                <p class="text-xs text-ink-faint">{{ formatDate(event.date) }}</p>
              </div>
              <AppButton v-if="canManage" variant="ghost" size="sm" @click="openEventEdit(event)">
                <Settings2 class="size-4" />
                Edit event
              </AppButton>
            </div>

            <div class="grid gap-2 md:grid-cols-2">
              <MatchCard
                v-for="match in event.matches"
                :key="match.gameId"
                :match="match"
                :editable="canManage"
                @edit="openEditMatch"
              />
            </div>
          </section>

          <AppButton v-if="hasMore" variant="secondary" block @click="loadMore">Load more</AppButton>
        </template>
      </div>
    </div>
  </PullRefresh>

  <!-- Filter sheet -->
  <FilterSheet
    v-model="showFilterSheet"
    :filters="filters"
    :players="players"
    :events="events"
    @apply="applyFilters"
  />

  <!-- Quick score edit sheet -->
  <Sheet v-model="showEditSheet" title="Edit match score">
    <div v-if="editingMatch" class="flex flex-col gap-4">
      <div class="rounded-xl bg-surface-2 p-3.5">
        <p class="text-[10px] font-bold uppercase tracking-widest text-ink-faint">Team 1</p>
        <p class="mt-1 text-sm font-medium text-ink">{{ editingMatch.team1.join(' & ') }}</p>
        <input
          type="number"
          min="0"
          placeholder="0"
          inputmode="numeric"
          aria-label="Team 1 score"
          class="mt-2 w-full rounded-xl border border-line bg-surface-1 py-2.5 text-center font-mono text-2xl font-bold tabular-nums text-brand focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          :value="editScore1"
          @input="editScore1 = parseScoreInput(($event.target as HTMLInputElement).value)"
        />
      </div>
      <p class="text-center text-xs font-bold uppercase tracking-widest text-ink-faint">vs</p>
      <div class="rounded-xl bg-surface-2 p-3.5">
        <p class="text-[10px] font-bold uppercase tracking-widest text-ink-faint">Team 2</p>
        <p class="mt-1 text-sm font-medium text-ink">{{ editingMatch.team2.join(' & ') }}</p>
        <input
          type="number"
          min="0"
          placeholder="0"
          inputmode="numeric"
          aria-label="Team 2 score"
          class="mt-2 w-full rounded-xl border border-line bg-surface-1 py-2.5 text-center font-mono text-2xl font-bold tabular-nums text-brand focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          :value="editScore2"
          @input="editScore2 = parseScoreInput(($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="flex items-start gap-2 rounded-xl bg-warn/10 px-3.5 py-3 text-xs text-warn">
        <AlertTriangle class="mt-0.5 size-4 shrink-0" />
        <span>
          Updating this score will recalculate ratings for the entire group from this event onwards.
          This may take a moment.
        </span>
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end gap-3">
        <AppButton variant="secondary" :disabled="isSavingEdit" @click="showEditSheet = false">Cancel</AppButton>
        <AppButton :loading="isSavingEdit" @click="saveMatchEdit">Save &amp; recalculate</AppButton>
      </div>
    </template>
  </Sheet>

  <!-- Event edit sheet -->
  <EventEditSheet
    v-model="showEventEditSheet"
    :event="editingEvent"
    :group-id="groupId"
    @saved="handleEventEditSaved"
  />
</template>
