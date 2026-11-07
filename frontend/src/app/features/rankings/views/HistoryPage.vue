<script setup lang="ts">
/**
 * Completed games, grouped by event. Filters live in the URL (?eventId, ?playerId,
 * ?secondaryPlayerId, ?relationship) so links land pre-filtered. Organizers can correct a
 * completed event; ?eventId opens that correction for them (the event page links here).
 */
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RefreshCw, SlidersHorizontal, Wrench } from 'lucide-vue-next'
import { useLeagueStore } from '@/stores/league'
import { rankingsApi } from '../services/rankings.api'
import { eventsApi } from '@/app/features/events/services/events.api'
import { api } from '@/app/core/http/api-client'
import type { EventDto, EventListItemDto, MatchHistoryEntryDto } from '@/app/core/models/dto'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import AccountButton from '@/app/core/layout/AccountButton.vue'
import UiState from '@/app/core/ui/UiState.vue'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import CourtTile from '@/app/core/ui/CourtTile.vue'
import { toast } from '@/app/core/ui/feedback'
import { eventTitle, formatDay } from '@/app/features/events/eventProgress'
import EventEditModal from '../components/EventEditModal.vue'
import {
  filtersFromQuery, filtersToQuery, historyOptions, hasFilters, groupByEvent, outcomeFor, type HistoryFilters
} from '../historyView'

const route = useRoute()
const router = useRouter()
const league = useLeagueStore()
const groupId = computed(() => route.params.groupId as string)

const matches = ref<MatchHistoryEntryDto[]>([])
const events = ref<EventListItemDto[]>([])
const loading = ref(true)
const loadError = ref('')
const refreshing = ref(false)
const filtersOpen = ref(false)
let token = 0
let defaulted = false

const filters = computed(() => filtersFromQuery(route.query))
const groups = computed(() => groupByEvent(matches.value))
const sortedPlayers = computed(() => [...league.players].sort((a, b) => a.displayName.localeCompare(b.displayName)))
const nameOf = (playerId: string) => league.players.find(p => p.playerId === playerId)?.displayName ?? ''
const eventName = (id: string) => {
  const e = events.value.find(x => x.id === id) ?? groups.value.find(x => x.id === id)
  return e ? eventTitle(e) : 'one event'
}

const summary = computed(() => {
  const f = filters.value
  let s = f.playerId ? `${nameOf(f.playerId) || 'One player'}'s games` : 'All games'
  if (f.playerId && f.secondaryPlayerId) {
    s += f.relationship === 'teammate' ? ` with ${nameOf(f.secondaryPlayerId)} as teammate` : ` against ${nameOf(f.secondaryPlayerId)}`
  }
  if (f.eventId) s += ` in ${eventName(f.eventId)}`
  return s
})

function setFilters(patch: Partial<HistoryFilters>) {
  const next = { ...filters.value, ...patch }
  if (!next.playerId) next.secondaryPlayerId = ''
  void router.replace({ query: filtersToQuery(next) })
}

async function loadHistory() {
  const mine = ++token
  loading.value = true
  loadError.value = ''
  try {
    const res = await rankingsApi.getHistory(groupId.value, historyOptions(filters.value))
    if (mine !== token) return
    matches.value = res.matches
    if (!league.isOrganizer) {
      const known = new Set(events.value.map(e => e.id))
      for (const g of groupByEvent(res.matches)) {
        if (!known.has(g.id)) events.value.push({ id: g.id, name: g.name, startsAt: g.date, status: 'COMPLETED', courts: 0, rounds: 0 })
      }
    }
  } catch (e) {
    if (mine !== token) return
    loadError.value = (e as { message?: string }).message || 'Check your connection and try again.'
  }
  loading.value = false
  maybeAutoOpen()
}

async function init() {
  loading.value = true
  await league.load(groupId.value)
  if (league.error) { loading.value = false; return }
  // listing events is organizer-only; players pick from the events their history has shown
  if (league.isOrganizer) eventsApi.list(groupId.value, 'COMPLETED').then(r => { events.value = r.events }).catch(() => { events.value = [] })
  // first visit with no filters shows the signed-in player's own games
  if (!defaulted && !route.query.playerId && !route.query.eventId && league.me) {
    defaulted = true
    await router.replace({ query: { ...route.query, playerId: league.me.playerId } })
    return // the query watcher loads
  }
  defaulted = true
  await loadHistory()
}

watch(groupId, () => { defaulted = false; events.value = []; void init() }, { immediate: true })
watch(() => route.fullPath, (now, before) => {
  if (route.params.groupId === groupId.value && before && now !== before && !league.error) void loadHistory()
})

async function refresh() {
  refreshing.value = true
  api.invalidateCache(`/api/groups/${groupId.value}`)
  await league.load(groupId.value, true)
  await loadHistory()
  refreshing.value = false
  if (!loadError.value && !league.error) toast('History refreshed')
}

// corrections (organizers)
const editing = ref<EventDto | null>(null)
const editorOpen = ref(false)
const focusGameId = ref<string | undefined>()
const opening = ref('')
let autoOpenedFor = ''

async function openEditor(eventId: string, gameId?: string) {
  if (!league.isOrganizer || opening.value) return
  opening.value = eventId
  try {
    // the full event, not just the filtered games
    editing.value = await eventsApi.get(eventId)
    focusGameId.value = gameId
    editorOpen.value = true
  } catch (e) {
    toast(`Event didn't open. ${(e as { message?: string }).message || 'Try again.'}`, 'bad')
  } finally {
    opening.value = ''
  }
}

function maybeAutoOpen() {
  const id = filters.value.eventId
  if (!id || id === autoOpenedFor || !league.isOrganizer || !matches.value.length) return
  autoOpenedFor = id
  void openEditor(id)
}

async function onSaved() {
  toast('Corrections saved. Ratings recalculated.')
  await league.load(groupId.value, true)
  await loadHistory()
}

// Round headings carry the round, so a tile only says how the filtered player did.
function caption(m: MatchHistoryEntryDto) {
  const who = nameOf(filters.value.playerId)
  const o = outcomeFor(m, who)
  return o ? `${who} ${o}` : undefined
}

// matches arrive sorted by round, then court
function byRound(list: MatchHistoryEntryDto[]) {
  const rounds: { index: number; matches: MatchHistoryEntryDto[] }[] = []
  for (const m of list) {
    const last = rounds[rounds.length - 1]
    if (last?.index === m.roundIndex) last.matches.push(m)
    else rounds.push({ index: m.roundIndex, matches: [m] })
  }
  return rounds
}
</script>

<template>
  <div class="page">
    <UiState v-if="league.loading && !league.group" kind="loading" title="Loading history" />

    <UiState
      v-else-if="league.error?.status === 403 || league.error?.status === 404"
      kind="denied"
      heading="h1"
      title="This league isn't available to you"
      body="It may have been archived, or your account isn't on its roster. Ask the organizer to send you an invite link."
      action-label="See your leagues"
      action-to="/groups"
    />
    <UiState v-else-if="league.error" kind="error" heading="h1" title="League didn't load" :body="league.error.message" @retry="refresh" />

    <template v-else-if="league.group">
      <PageHeader title="History" :back-to="`/groups/${groupId}`" :back-label="league.group.name">
        <template #actions>
          <button type="button" class="icon-btn" aria-label="Refresh history" :disabled="refreshing" @click="refresh">
            <RefreshCw :size="20" :class="{ spin: refreshing }" aria-hidden="true" />
          </button>
          <AccountButton />
        </template>
      </PageHeader>

      <div class="filterbar">
        <p class="filterbar__text" aria-live="polite">{{ summary }}</p>
        <div class="filterbar__btns">
          <UiButton variant="secondary" @click="filtersOpen = true">
            <SlidersHorizontal :size="18" aria-hidden="true" /> Filters
          </UiButton>
          <UiButton v-if="hasFilters(filters)" variant="quiet" @click="setFilters({ eventId: '', playerId: '' })">Show all games</UiButton>
        </div>
      </div>

      <UiState v-if="loading && !matches.length" kind="loading" title="Loading games" />
      <UiState v-else-if="loadError" kind="error" title="History didn't load" :body="loadError" @retry="loadHistory" />
      <UiState
        v-else-if="!matches.length && hasFilters(filters)"
        kind="empty"
        title="No games match these filters"
        body="Only completed events show up here."
        action-label="Show all games"
        @action="setFilters({ eventId: '', playerId: '' })"
      />
      <UiState
        v-else-if="!matches.length"
        kind="empty"
        title="No games yet"
        :body="league.isOrganizer ? 'Games show up here after you complete an event.' : 'Games show up here after the organizer completes an event.'"
      />

      <template v-else>
      <section v-for="ev in groups" :key="ev.id" class="section" :aria-labelledby="`ev-${ev.id}`">
        <div class="evhead">
          <div class="evhead__text">
            <h2 :id="`ev-${ev.id}`" class="truncate">{{ eventTitle({ name: ev.name, startsAt: ev.date }) }}</h2>
            <p class="muted evhead__date">{{ formatDay(ev.date) }}, {{ ev.matches.length }} {{ ev.matches.length === 1 ? 'game' : 'games' }}</p>
          </div>
          <UiButton v-if="league.isOrganizer" variant="secondary" :loading="opening === ev.id" @click="openEditor(ev.id)">
            <Wrench :size="18" aria-hidden="true" /> Correct scores
          </UiButton>
        </div>
        <div v-for="r in byRound(ev.matches)" :key="r.index" class="round">
        <h3 class="round__h">Round {{ r.index + 1 }}</h3>
        <ol role="list" class="games">
          <li v-for="m in r.matches" :key="m.gameId">
            <CourtTile
              :court="m.courtIndex + 1"
              :team1="m.team1"
              :team2="m.team2"
              :score1="m.scoreTeam1"
              :score2="m.scoreTeam2"
              state="final"
              :caption="caption(m)"
              :interactive="league.isOrganizer"
              @select="openEditor(ev.id, m.gameId)"
            />
          </li>
        </ol>
        </div>
      </section>
      </template>

      <UiSheet :open="filtersOpen" title="Filter games" @close="filtersOpen = false">
        <div class="stack-sm filters">
          <div class="sel">
            <label for="f-event">Event</label>
            <select id="f-event" :value="filters.eventId" @change="setFilters({ eventId: ($event.target as HTMLSelectElement).value })">
              <option value="">All events</option>
              <option v-for="e in events" :key="e.id" :value="e.id">{{ eventTitle(e) }}</option>
            </select>
          </div>
          <div class="sel">
            <label for="f-player">Player</label>
            <select id="f-player" :value="filters.playerId" @change="setFilters({ playerId: ($event.target as HTMLSelectElement).value })">
              <option value="">All players</option>
              <option v-for="p in sortedPlayers" :key="p.playerId" :value="p.playerId">{{ p.displayName }}</option>
            </select>
          </div>
          <div v-if="filters.playerId" class="sel">
            <label for="f-second">With or against</label>
            <select id="f-second" :value="filters.secondaryPlayerId" @change="setFilters({ secondaryPlayerId: ($event.target as HTMLSelectElement).value })">
              <option value="">Anyone</option>
              <option v-for="p in sortedPlayers.filter(x => x.playerId !== filters.playerId)" :key="p.playerId" :value="p.playerId">{{ p.displayName }}</option>
            </select>
          </div>
          <fieldset v-if="filters.playerId && filters.secondaryPlayerId" class="seg">
            <legend>{{ nameOf(filters.secondaryPlayerId) }} played as</legend>
            <div class="seg__opts">
              <label class="seg__opt">
                <input type="radio" name="rel" value="teammate" class="visually-hidden" :checked="filters.relationship === 'teammate'" @change="setFilters({ relationship: 'teammate' })">
                <span>Teammate</span>
              </label>
              <label class="seg__opt">
                <input type="radio" name="rel" value="opponent" class="visually-hidden" :checked="filters.relationship === 'opponent'" @change="setFilters({ relationship: 'opponent' })">
                <span>Opponent</span>
              </label>
            </div>
          </fieldset>
        </div>
        <template #actions>
          <UiButton variant="primary" size="lg" block @click="filtersOpen = false">
            {{ loading ? 'Show games' : `Show ${matches.length} ${matches.length === 1 ? 'game' : 'games'}` }}
          </UiButton>
        </template>
      </UiSheet>

      <EventEditModal
        v-if="league.isOrganizer"
        :open="editorOpen"
        :event="editing"
        :group-id="groupId"
        :focus-game-id="focusGameId"
        @close="editorOpen = false"
        @saved="onSaved"
      />
    </template>
  </div>
</template>

<style scoped>
.icon-btn {
  width: var(--tap); height: var(--tap);
  display: grid; place-items: center;
  border: 0; border-radius: 50%;
  background: transparent;
  color: var(--ink);
}
.icon-btn:hover { background: var(--surface-sunk); }
.spin { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.filterbar { display: flex; flex-direction: column; gap: var(--s2); margin-top: var(--s4); }
.filterbar__text { font-weight: 700; }
.filterbar__btns { display: flex; flex-wrap: wrap; gap: var(--s2); }

.evhead { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s3); margin-bottom: var(--s3); }
.evhead__text { flex: 1 1 12rem; min-width: 0; }
.evhead__date { font-size: var(--text-sm); }
.round + .round { margin-top: var(--s4); }
.round__h { font-size: var(--text-md); margin-bottom: var(--s2); }
.games { display: flex; flex-direction: column; gap: var(--s3); list-style: none; margin: 0; padding: 0; }
/* every game here is final; the section says so, so the tile's own "Final" is noise */
.games :deep(.court__foot .status) { display: none; }
.games :deep(.court__foot:not(:has(.court__tie, .court__caption))) { display: none; }

.filters { padding-bottom: var(--s2); }
.sel { display: flex; flex-direction: column; gap: var(--s1); }
.sel label, .seg legend { font-weight: 700; font-size: var(--text-sm); }
.sel select {
  width: 100%;
  min-height: var(--tap);
  padding: var(--s2) var(--s3);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-control);
  background: var(--surface);
  color: var(--ink);
}
.sel select:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }

.seg { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s1); }
.seg__opts {
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px;
  padding: 4px;
  border-radius: var(--r-control);
  background: var(--surface-sunk);
}
.seg__opt span {
  display: grid; place-items: center;
  min-height: var(--tap);
  border-radius: 6px;
  font-weight: 700;
  color: var(--ink-2);
  cursor: pointer;
}
.seg__opt input:checked + span { background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 2px var(--line-strong); }
.seg__opt input:focus-visible + span { outline: 3px solid var(--focus); outline-offset: 1px; }
</style>
