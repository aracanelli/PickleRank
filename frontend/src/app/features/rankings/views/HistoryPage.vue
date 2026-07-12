<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { ChartColumn, SlidersHorizontal, Settings2, X, AlertTriangle, Swords } from 'lucide-vue-next'
import { rankingsApi } from '../services/rankings.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { eventsApi } from '@/app/features/events/services/events.api'
import { api } from '@/app/core/http/api-client'
import type { MatchHistoryEntryDto, GroupDto, EventListItemDto } from '@/app/core/models/dto'
import { useAuthStore } from '@/stores/auth'
import { useGroupContextStore, type GroupRole } from '@/stores/group-context'
import { useToast } from '@/app/core/ui/composables/useToast'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import { usePlayerIndex } from '@/app/features/players/composables/usePlayerIndex'
import { computeH2H } from '@/app/features/players/utils/head-to-head'
import { groupByEvent, outcomeFor, type EventGroup } from '../utils/match-derivations'
import PullRefresh from '@/app/core/ui/components/PullRefresh.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import SegmentedControl from '@/app/core/ui/components/SegmentedControl.vue'
import MatchCard from '../components/MatchCard.vue'
import VersusPicker from '../components/VersusPicker.vue'
import H2HBar from '../components/H2HBar.vue'
import FilterSheet, { emptyFilters, type HistoryFilters } from '../components/FilterSheet.vue'
import EventEditSheet, { type EventEditData } from '../components/EventEditSheet.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()
const toast = useToast()

const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const playerIndex = usePlayerIndex(groupId)
const players = playerIndex.players
const events = ref<EventListItemDto[]>([])
const matches = ref<MatchHistoryEntryDto[]>([])
const isLoading = ref(true)
const error = ref('')

// Applied filters (edited via FilterSheet)
const filters = ref<HistoryFilters>(emptyFilters())
const showFilterSheet = ref(false)

const canManage = computed(() => groupContext.canManage)

// --- FEED | HEAD-TO-HEAD mode (driven by ?h2h presence) ----------------------
// ?h2h=P1 or ?h2h=P1,P2 — GLOBAL player ids in the URL, shareable.

type HistoryMode = 'feed' | 'h2h'

const mode = ref<HistoryMode>(route.query.h2h !== undefined ? 'h2h' : 'feed')
const h2hP1 = ref('')
const h2hP2 = ref('')

{
  const param = route.query.h2h
  if (typeof param === 'string' && param) {
    const [p1, p2] = param.split(',')
    h2hP1.value = p1 || ''
    h2hP2.value = p2 || ''
  }
}

const modeOptions = [
  { label: 'FEED', value: 'feed' },
  { label: 'HEAD-TO-HEAD', value: 'h2h' }
]

// SegmentedControl models a plain string; bridge to the narrowed union type
const modeModel = computed({
  get: () => mode.value as string,
  set: (value: string) => {
    mode.value = value === 'h2h' ? 'h2h' : 'feed'
  }
})

// Keep the URL in sync so H2H links are shareable
function syncModeQuery() {
  const query: LocationQueryRaw = { ...route.query }
  if (mode.value === 'h2h') {
    query.h2h = [h2hP1.value, h2hP2.value].filter(Boolean).join(',')
  } else {
    delete query.h2h
  }
  const current = route.query.h2h
  if (current !== query.h2h) router.replace({ query })
}

watch([mode, h2hP1, h2hP2], syncModeQuery)

onMounted(async () => {
  await Promise.all([loadGroup(), playerIndex.load(), loadEvents()])
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

  const jobs: Promise<void>[] = [loadHistory()]
  if (bothPicked.value) jobs.push(loadH2H())
  await Promise.all(jobs)
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
  return playerIndex.byGlobalPlayerId.value.get(playerId)?.displayName || 'Player'
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

const matchesByEvent = computed<EventGroup[]>(() => groupByEvent(matches.value))

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

// --- Head-to-head data --------------------------------------------------------

const bothPicked = computed(() => !!h2hP1.value && !!h2hP2.value)

const h2hOpponentMatches = ref<MatchHistoryEntryDto[]>([])
const h2hTeammateMatches = ref<MatchHistoryEntryDto[]>([])
const isH2hLoading = ref(false)
const h2hError = ref('')

async function loadH2H() {
  if (!bothPicked.value) return
  isH2hLoading.value = true
  h2hError.value = ''
  try {
    const [opponents, teammates] = await Promise.all([
      rankingsApi.getHistory(groupId.value, {
        playerId: h2hP1.value,
        secondaryPlayerId: h2hP2.value,
        relationship: 'opponent'
      }),
      rankingsApi.getHistory(groupId.value, {
        playerId: h2hP1.value,
        secondaryPlayerId: h2hP2.value,
        relationship: 'teammate'
      })
    ])
    h2hOpponentMatches.value = opponents.matches
    h2hTeammateMatches.value = teammates.matches
  } catch (e) {
    h2hError.value = getApiErrorMessage(e, 'Failed to load head-to-head')
  } finally {
    isH2hLoading.value = false
  }
}

watch([h2hP1, h2hP2], () => {
  if (bothPicked.value) loadH2H()
})

// History team ids are GROUP-PLAYER ids — map the global P1 id via the index
const p1GroupPlayerId = computed(() =>
  h2hP1.value ? playerIndex.toGroupPlayerId(h2hP1.value) : undefined
)

const h2h = computed(() =>
  p1GroupPlayerId.value ? computeH2H(h2hOpponentMatches.value, p1GroupPlayerId.value) : null
)

const teammateRecord = computed(() => {
  const gpId = p1GroupPlayerId.value
  if (!gpId) return null
  let wins = 0
  let losses = 0
  let ties = 0
  for (const match of h2hTeammateMatches.value) {
    const outcome = outcomeFor(match, gpId)
    if (outcome === 'W') wins++
    else if (outcome === 'L') losses++
    else if (outcome === 'T') ties++
  }
  return { wins, losses, ties, games: wins + losses + ties }
})

const p1Name = computed(() => playerName(h2hP1.value))
const p2Name = computed(() => playerName(h2hP2.value))

interface TapeRow {
  label: string
  left: string
  right: string
  leftPct: number
  rightPct: number
}

const tapeRows = computed<TapeRow[]>(() => {
  const rec = h2h.value
  if (!rec || rec.games === 0) return []

  const p2WinRate = (rec.losses + 0.5 * rec.ties) / rec.games
  const rows: TapeRow[] = [
    {
      label: 'Record',
      left: `${rec.wins}-${rec.losses}-${rec.ties}`,
      right: `${rec.losses}-${rec.wins}-${rec.ties}`,
      leftPct: (rec.wins / rec.games) * 100,
      rightPct: (rec.losses / rec.games) * 100
    },
    {
      label: 'Win %',
      left: `${Math.round(rec.winRate * 100)}%`,
      right: `${Math.round(p2WinRate * 100)}%`,
      leftPct: rec.winRate * 100,
      rightPct: p2WinRate * 100
    },
    {
      label: 'Avg points',
      left: rec.avgPointsFor.toFixed(1),
      right: rec.avgPointsAgainst.toFixed(1),
      leftPct:
        rec.avgPointsFor + rec.avgPointsAgainst > 0
          ? (rec.avgPointsFor / (rec.avgPointsFor + rec.avgPointsAgainst)) * 100
          : 0,
      rightPct:
        rec.avgPointsFor + rec.avgPointsAgainst > 0
          ? (rec.avgPointsAgainst / (rec.avgPointsFor + rec.avgPointsAgainst)) * 100
          : 0
    }
  ]

  // Current streak shows on the leader's side (P1's L streak = P2's W streak)
  const streak = rec.streak
  if (streak) {
    if (streak.type === 'T') {
      rows.push({ label: 'Current streak', left: `T${streak.length}`, right: `T${streak.length}`, leftPct: 50, rightPct: 50 })
    } else if (streak.type === 'W') {
      rows.push({ label: 'Current streak', left: `W${streak.length}`, right: '—', leftPct: 100, rightPct: 0 })
    } else {
      rows.push({ label: 'Current streak', left: '—', right: `W${streak.length}`, leftPct: 0, rightPct: 100 })
    }
  }

  return rows
})

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

async function openEventEdit(event: EventGroup) {
  try {
    // Fetch full event data to get ALL games, not just filtered ones
    const fullEvent = await eventsApi.get(event.eventId)

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

    editingEvent.value = {
      id: event.eventId,
      name: event.eventName || 'Event',
      date: event.date,
      matches: allMatches
    }
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
  const jobs: Promise<void>[] = [loadHistory()]
  if (mode.value === 'h2h' && bothPicked.value) jobs.push(loadH2H())
  await Promise.all(jobs)
}
</script>

<template>
  <PullRefresh :on-refresh="refreshData">
    <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5">
      <div class="flex flex-col gap-4">
        <SegmentedControl v-model="modeModel" :options="modeOptions" />

        <!-- ============================== FEED ============================== -->
        <template v-if="mode === 'feed'">
          <!-- Filter button + applied chips -->
          <div class="flex flex-wrap items-center gap-2">
            <AppButton variant="secondary" size="sm" @click="showFilterSheet = true">
              <SlidersHorizontal class="size-4" />
              Filters
              <span
                v-if="activeFilterCount > 0"
                class="flex size-5 items-center justify-center rounded-full bg-accent-fill numeral text-xs text-accent-contrast"
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
            court
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
            <section v-for="event in visibleEvents" :key="event.eventId" class="flex flex-col gap-2">
              <!-- Sticky date/event eyebrow header -->
              <div
                class="sticky top-14 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-line bg-surface-page/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6"
              >
                <div class="min-w-0">
                  <p class="eyebrow text-ink-faint">{{ formatDate(event.date) }}</p>
                  <h2 class="display-wide truncate text-base text-ink">
                    {{ event.eventName || 'Event' }}
                  </h2>
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
        </template>

        <!-- =========================== HEAD-TO-HEAD ========================== -->
        <template v-else>
          <VersusPicker
            v-model:player-one="h2hP1"
            v-model:player-two="h2hP2"
            :players="players"
          />

          <AppEmptyState
            v-if="!bothPicked"
            court
            title="Pick your matchup"
            description="Choose two players to run the tale of the tape."
          >
            <template #icon><Swords class="size-7" /></template>
          </AppEmptyState>

          <template v-else>
            <SkeletonList v-if="isH2hLoading || playerIndex.isLoading.value" :rows="3" />

            <ErrorState v-else-if="h2hError" :message="h2hError" @retry="loadH2H" />

            <template v-else-if="h2h">
              <AppEmptyState
                v-if="h2h.games === 0"
                court
                title="These two have never crossed the net"
                description="No games with these players on opposite sides yet."
              >
                <template #icon><Swords class="size-7" /></template>
              </AppEmptyState>

              <!-- Tale of the tape -->
              <section
                v-else
                class="ticket-clip stadium-glow rounded-[20px] border border-line bg-surface-1 p-4 md:p-5"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="min-w-0 flex-1 truncate display-wide text-sm text-accent-text">
                    {{ p1Name }}
                  </span>
                  <span class="shrink-0 eyebrow text-ink-faint">Tale of the tape</span>
                  <span class="min-w-0 flex-1 truncate text-right display-wide text-sm text-info">
                    {{ p2Name }}
                  </span>
                </div>
                <div class="mt-4 flex flex-col gap-4">
                  <H2HBar
                    v-for="row in tapeRows"
                    :key="row.label"
                    :label="row.label"
                    :left="row.left"
                    :right="row.right"
                    :left-pct="row.leftPct"
                    :right-pct="row.rightPct"
                  />
                </div>
              </section>

              <!-- As teammates -->
              <section
                v-if="teammateRecord && teammateRecord.games > 0"
                class="rounded-[14px] border border-line bg-surface-1 p-4"
              >
                <h2 class="eyebrow text-ink-faint">As teammates</h2>
                <div class="mt-2 flex items-baseline gap-3">
                  <span class="numeral text-3xl text-ink">
                    {{ teammateRecord.wins }}-{{ teammateRecord.losses }}-{{ teammateRecord.ties }}
                  </span>
                  <span class="text-sm text-ink-muted">
                    W-L-T across {{ teammateRecord.games }}
                    {{ teammateRecord.games === 1 ? 'game' : 'games' }} together
                  </span>
                </div>
              </section>

              <!-- Last meetings -->
              <section v-if="h2h.lastMeetings.length > 0" class="flex flex-col gap-2">
                <h2 class="eyebrow text-ink-faint">Last meetings</h2>
                <MatchCard
                  v-for="match in h2h.lastMeetings"
                  :key="match.gameId"
                  :match="match"
                  show-caption
                />
              </section>
            </template>
          </template>
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
      <div class="rounded-[14px] bg-surface-2 p-3.5">
        <p class="eyebrow text-ink-faint">Team 1</p>
        <p class="mt-1 text-sm font-medium text-ink">{{ editingMatch.team1.join(' & ') }}</p>
        <input
          type="number"
          min="0"
          placeholder="0"
          inputmode="numeric"
          aria-label="Team 1 score"
          class="mt-2 w-full rounded-[10px] border border-line bg-surface-1 py-2.5 text-center numeral text-2xl text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          :value="editScore1"
          @input="editScore1 = parseScoreInput(($event.target as HTMLInputElement).value)"
        />
      </div>
      <p class="text-center eyebrow text-ink-faint">vs</p>
      <div class="rounded-[14px] bg-surface-2 p-3.5">
        <p class="eyebrow text-ink-faint">Team 2</p>
        <p class="mt-1 text-sm font-medium text-ink">{{ editingMatch.team2.join(' & ') }}</p>
        <input
          type="number"
          min="0"
          placeholder="0"
          inputmode="numeric"
          aria-label="Team 2 score"
          class="mt-2 w-full rounded-[10px] border border-line bg-surface-1 py-2.5 text-center numeral text-2xl text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          :value="editScore2"
          @input="editScore2 = parseScoreInput(($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="flex items-start gap-2 rounded-[14px] bg-warn/10 px-3.5 py-3 text-xs text-warn">
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
