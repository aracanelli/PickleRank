<script setup lang="ts">
/**
 * Completed games, grouped by event. Filters live in the URL (?eventId, ?playerId,
 * ?secondaryPlayerId, ?relationship) so links land pre-filtered. Organizers can correct a
 * completed event; ?eventId opens that correction for them (the event page links here).
 * ?h2h=<playerId>,<playerId> switches to head to head between two players (global ids, shareable).
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
import { computeH2H } from '@/app/features/players/utils/head-to-head'
import { outcomeFor as sideOutcome } from '../utils/match-derivations'

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
const h2hMode = computed(() => route.query.h2h !== undefined)
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
  // date inputs give yyyy-mm-dd; read as local midnight so the day doesn't shift
  const day = (d: string) => new Date(`${d}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  if (f.from && f.to) s += `, ${day(f.from)} to ${day(f.to)}`
  else if (f.from) s += ` since ${day(f.from)}`
  else if (f.to) s += ` until ${day(f.to)}`
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
  if (h2hMode.value) { loading.value = false; void loadH2H(); return }
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
  if (route.params.groupId !== groupId.value || !before || now === before || league.error) return
  if (h2hMode.value) void loadH2H()
  else void loadHistory()
})

async function refresh() {
  refreshing.value = true
  api.invalidateCache(`/api/groups/${groupId.value}`)
  await league.load(groupId.value, true)
  await (h2hMode.value ? loadH2H() : loadHistory())
  refreshing.value = false
  if (!loadError.value && !h2hError.value && !league.error) toast('History refreshed')
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

// ---- head to head ----
const h2hIds = computed(() => {
  const raw = typeof route.query.h2h === 'string' ? route.query.h2h : ''
  const [a = '', b = ''] = raw.split(',')
  return { p1: a, p2: b && b !== a ? b : '' }
})
const h2hBoth = computed(() => !!h2hIds.value.p1 && !!h2hIds.value.p2)
const vsGames = ref<MatchHistoryEntryDto[]>([])
const withGames = ref<MatchHistoryEntryDto[]>([])
const h2hLoading = ref(false)
const h2hError = ref('')
let h2hToken = 0

function setMode(h2h: boolean) {
  if (h2h === h2hMode.value) return
  // start from the filtered player, or yourself
  const p1 = filters.value.playerId || league.me?.playerId || ''
  void router.replace({ query: h2h ? { h2h: p1 } : filtersToQuery({ ...filters.value, eventId: '', playerId: h2hIds.value.p1 }) })
}
function setPair(patch: { p1?: string; p2?: string }) {
  const next = { ...h2hIds.value, ...patch }
  void router.replace({ query: { h2h: [next.p1, next.p2].filter(Boolean).join(',') } })
}

async function loadH2H() {
  const mine = ++h2hToken
  h2hError.value = ''
  if (!h2hBoth.value) { vsGames.value = []; withGames.value = []; return }
  h2hLoading.value = true
  const { p1, p2 } = h2hIds.value
  try {
    const [vs, together] = await Promise.all([
      rankingsApi.getHistory(groupId.value, { playerId: p1, secondaryPlayerId: p2, relationship: 'opponent' }),
      rankingsApi.getHistory(groupId.value, { playerId: p1, secondaryPlayerId: p2, relationship: 'teammate' })
    ])
    if (mine !== h2hToken) return
    vsGames.value = vs.matches
    withGames.value = together.matches
  } catch (e) {
    if (mine !== h2hToken) return
    h2hError.value = (e as { message?: string }).message || 'Check your connection and try again.'
  }
  h2hLoading.value = false
}

// history team ids are group player ids
const p1GroupId = computed(() => league.players.find(p => p.playerId === h2hIds.value.p1)?.id ?? '')
const h2h = computed(() => (p1GroupId.value ? computeH2H(vsGames.value, p1GroupId.value) : null))
const together = computed(() => {
  const r = { won: 0, lost: 0, tied: 0 }
  for (const m of withGames.value) {
    const o = sideOutcome(m, p1GroupId.value)
    if (o === 'W') r.won++
    else if (o === 'L') r.lost++
    else if (o === 'T') r.tied++
  }
  return { ...r, games: r.won + r.lost + r.tied }
})
const p1Name = computed(() => nameOf(h2hIds.value.p1) || 'Player one')
const p2Name = computed(() => nameOf(h2hIds.value.p2) || 'Player two')
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const leadLine = computed(() => {
  const r = h2h.value
  if (!r || !r.games) return ''
  const games = plural(r.games, 'game', 'games')
  if (r.wins === r.losses) return `Level at ${r.wins} each over ${games}.`
  return r.wins > r.losses
    ? `${p1Name.value} leads ${r.wins} to ${r.losses} over ${games}.`
    : `${p2Name.value} leads ${r.losses} to ${r.wins} over ${games}.`
})
const runLine = computed(() => {
  const st = h2h.value?.streak
  if (!st) return ''
  if (st.type === 'T') return `Tied the last ${plural(st.length, 'game', 'games')}`
  const who = st.type === 'W' ? p1Name.value : p2Name.value
  return st.length === 1 ? `${who} won the last game` : `${who} won the last ${st.length}`
})

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

      <div class="modes" role="group" aria-label="Show">
        <button type="button" class="seg__btn" :aria-pressed="!h2hMode" @click="setMode(false)">Games</button>
        <button type="button" class="seg__btn" :aria-pressed="h2hMode" @click="setMode(true)">Head to head</button>
      </div>

      <section v-if="h2hMode" class="section h2h" aria-labelledby="h2h-h">
        <h2 id="h2h-h" class="visually-hidden">Head to head</h2>
        <div class="pair">
          <div class="sel">
            <label for="h-p1">Player</label>
            <select id="h-p1" :value="h2hIds.p1" @change="setPair({ p1: ($event.target as HTMLSelectElement).value })">
              <option value="">Pick a player</option>
              <option v-for="p in sortedPlayers.filter(x => x.playerId !== h2hIds.p2)" :key="p.playerId" :value="p.playerId">{{ p.displayName }}</option>
            </select>
          </div>
          <div class="sel">
            <label for="h-p2">Against</label>
            <select id="h-p2" :value="h2hIds.p2" @change="setPair({ p2: ($event.target as HTMLSelectElement).value })">
              <option value="">Pick a player</option>
              <option v-for="p in sortedPlayers.filter(x => x.playerId !== h2hIds.p1)" :key="p.playerId" :value="p.playerId">{{ p.displayName }}</option>
            </select>
          </div>
        </div>

        <UiState v-if="!h2hBoth" kind="empty" title="Pick two players" body="See who wins when they play each other, and how they do as partners." />
        <UiState v-else-if="h2hLoading" kind="loading" title="Loading head to head" />
        <UiState v-else-if="h2hError" kind="error" title="Head to head didn't load" :body="h2hError" @retry="loadH2H" />
        <template v-else-if="h2h">
          <UiState
            v-if="!h2h.games && !together.games"
            kind="empty"
            title="No games together yet"
            :body="`${p1Name} and ${p2Name} haven't played in the same completed game.`"
          />
          <template v-else>
            <div v-if="h2h.games" class="tape">
              <p class="tape__side">
                <span class="truncate tape__name">{{ p1Name }}</span>
                <span class="num tape__wins">{{ h2h.wins }}</span>
                <span>{{ h2h.wins === 1 ? 'win' : 'wins' }}</span>
              </p>
              <span class="tape__net" aria-hidden="true" />
              <p class="tape__side">
                <span class="truncate tape__name">{{ p2Name }}</span>
                <span class="num tape__wins">{{ h2h.losses }}</span>
                <span>{{ h2h.losses === 1 ? 'win' : 'wins' }}</span>
              </p>
            </div>
            <p v-if="h2h.games" class="lead">{{ leadLine }}</p>
            <p v-else class="muted">{{ p1Name }} and {{ p2Name }} haven't played against each other yet.</p>
            <dl class="facts">
              <div v-if="h2h.ties" class="fact"><dt>Ties</dt><dd class="num">{{ h2h.ties }}</dd></div>
              <div v-if="h2h.games" class="fact">
                <dt>Average score</dt>
                <dd><span class="num">{{ h2h.avgPointsFor.toFixed(1) }}</span> to <span class="num">{{ h2h.avgPointsAgainst.toFixed(1) }}</span></dd>
              </div>
              <div v-if="runLine" class="fact"><dt>Latest run</dt><dd>{{ runLine }}</dd></div>
              <div class="fact">
                <dt>As partners</dt>
                <dd>
                  <template v-if="together.games">{{ together.won }} won, {{ together.lost }} lost<template v-if="together.tied">, {{ together.tied }} tied</template></template>
                  <template v-else>Never partnered</template>
                </dd>
              </div>
            </dl>
            <template v-if="h2h.lastMeetings.length">
              <h3 class="round__h">Last meetings</h3>
              <ol role="list" class="games">
                <li v-for="m in h2h.lastMeetings" :key="m.gameId">
                  <CourtTile
                    :court="m.courtIndex + 1"
                    :team1="m.team1"
                    :team2="m.team2"
                    :score1="m.scoreTeam1"
                    :score2="m.scoreTeam2"
                    state="final"
                    :caption="`${m.eventName || 'Event'}, ${formatDay(m.date)}`"
                  />
                </li>
              </ol>
            </template>
          </template>
        </template>
      </section>

      <template v-else>
      <div class="filterbar">
        <p class="filterbar__text" aria-live="polite">{{ summary }}</p>
        <div class="filterbar__btns">
          <UiButton variant="secondary" @click="filtersOpen = true">
            <SlidersHorizontal :size="18" aria-hidden="true" /> Filters
          </UiButton>
          <UiButton v-if="hasFilters(filters)" variant="quiet" @click="setFilters({ eventId: '', playerId: '', from: '', to: '' })">Show all games</UiButton>
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
        @action="setFilters({ eventId: '', playerId: '', from: '', to: '' })"
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
      </template>

      <UiSheet :open="filtersOpen" title="Filter games" @close="filtersOpen = false">
        <div class="stack-sm filters">
          <div class="dates">
            <div class="sel">
              <label for="f-from">From</label>
              <input id="f-from" type="date" :value="filters.from" :max="filters.to || undefined" @change="setFilters({ from: ($event.target as HTMLInputElement).value })">
            </div>
            <div class="sel">
              <label for="f-to">To</label>
              <input id="f-to" type="date" :value="filters.to" :min="filters.from || undefined" @change="setFilters({ to: ($event.target as HTMLInputElement).value })">
            </div>
          </div>
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
.dates { display: grid; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); gap: var(--s3); }
.sel input { font: inherit; }
.sel select, .sel input {
  width: 100%;
  min-height: var(--tap);
  padding: var(--s2) var(--s3);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-control);
  background: var(--surface);
  color: var(--ink);
}
.sel select:focus-visible, .sel input:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }

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

.modes { margin-top: var(--s4); display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: var(--r-control); background: var(--surface-sunk); }
.seg__btn {
  min-height: var(--tap);
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-2);
  font-weight: 700;
}
.seg__btn[aria-pressed='true'] { background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 2px var(--line-strong); }
.seg__btn:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }

.h2h { display: flex; flex-direction: column; gap: var(--s4); }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: var(--s3); }
.tape {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: var(--s3);
  padding: var(--s4);
  border-radius: var(--r-tile);
  background: var(--court);
  color: var(--on-court);
}
.tape__side { display: flex; flex-direction: column; align-items: center; min-width: 0; margin: 0; text-align: center; }
.tape__name { max-width: 100%; font-weight: 700; }
.tape__wins { font-size: var(--num-lg); line-height: 1.1; }
.tape__net { width: 2px; background: var(--on-court); opacity: .5; }
.lead { font-weight: 700; }
.facts { display: flex; flex-direction: column; margin: 0; }
.fact {
  display: flex; align-items: center; justify-content: space-between; gap: var(--s3);
  min-height: var(--tap);
  border-bottom: 1px solid var(--line);
}
.fact dd { margin: 0; font-weight: 700; text-align: right; }
</style>
