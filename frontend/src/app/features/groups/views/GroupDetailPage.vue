<script setup lang="ts">
/**
 * League home. Organizers see tonight's event and the one next action;
 * players see their own standing and recent games.
 */
import { ref, computed, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { Settings, RefreshCw, Trash2, Wallet, ChevronRight, CalendarClock } from 'lucide-vue-next'
import { useLeagueStore } from '@/stores/league'
import { eventsApi } from '@/app/features/events/services/events.api'
import { rankingsApi } from '@/app/features/rankings/services/rankings.api'
import { api } from '@/app/core/http/api-client'
import type { EventDto, EventListItemDto, RankingEntryDto, MatchHistoryEntryDto } from '@/app/core/models/dto'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import AccountButton from '@/app/core/layout/AccountButton.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiState from '@/app/core/ui/UiState.vue'
import ActionBar from '@/app/core/ui/ActionBar.vue'
import StandingRow from '@/app/core/ui/StandingRow.vue'
import CourtTile from '@/app/core/ui/CourtTile.vue'
import { confirm, toast } from '@/app/core/ui/feedback'
import { progress, eventTitle, formatDay } from '@/app/features/events/eventProgress'

const route = useRoute()
const league = useLeagueStore()
const groupId = computed(() => route.params.groupId as string)

const unfinished = ref<EventListItemDto[]>([])
const active = ref<EventDto | null>(null)
const recentEvents = ref<EventListItemDto[]>([])
const rankings = ref<RankingEntryDto[]>([])
const myGames = ref<MatchHistoryEntryDto[]>([])
const loadingExtras = ref(true)
const refreshing = ref(false)

const permanentCount = computed(() => league.players.filter(p => p.membershipType === 'PERMANENT').length)
const activeProgress = computed(() => (active.value && active.value.games.length ? progress(active.value) : null))
const myRank = computed(() => rankings.value.find(r => r.playerId === league.me?.playerId) ?? null)
// Rankings and history use the global player id; profile routes use the league (group player) id.
const profileId = (playerId: string) => league.players.find(p => p.playerId === playerId)?.id

async function loadExtras() {
  loadingExtras.value = true
  const id = groupId.value
  await league.load(id)
  if (league.error) {
    loadingExtras.value = false
    return
  }
  const tasks: Promise<unknown>[] = [
    rankingsApi.getRankings(id).then(r => { rankings.value = r.rankings }).catch(() => { rankings.value = [] })
  ]
  if (league.isOrganizer) {
    tasks.push(eventsApi.list(id).then(async res => {
      const open = res.events.filter(e => e.status !== 'COMPLETED')
      unfinished.value = open
      recentEvents.value = res.events.filter(e => e.status === 'COMPLETED').slice(0, 3)
      active.value = open[0] ? await eventsApi.get(open[0].id).catch(() => null) : null
    }).catch(() => { unfinished.value = []; active.value = null }))
  } else if (league.me) {
    tasks.push(rankingsApi.getHistory(id, { playerId: league.me.playerId }).then(r => { myGames.value = r.matches.slice(0, 3) }).catch(() => { myGames.value = [] }))
  }
  await Promise.all(tasks)
  loadingExtras.value = false
}

watch(groupId, () => { void loadExtras() }, { immediate: true })

async function refresh() {
  refreshing.value = true
  api.invalidateCache(`/api/groups/${groupId.value}`)
  await league.load(groupId.value, true)
  await loadExtras()
  refreshing.value = false
  toast('League refreshed')
}

async function removeEvent(e: EventListItemDto) {
  const ok = await confirm({
    title: `Delete ${eventTitle(e)}?`,
    body: 'The schedule and any scores entered for it are removed. Completed events cannot be deleted.',
    confirmLabel: 'Delete event',
    danger: true
  })
  if (!ok) return
  try {
    await eventsApi.delete(e.id)
    toast('Event deleted')
    await loadExtras()
  } catch (err) {
    toast((err as { message?: string }).message || 'Event not deleted', 'bad')
  }
}

const otherUnfinished = computed(() => unfinished.value.slice(1))

function statusLine(e: EventListItemDto) {
  if (e.status === 'DRAFT') return 'Schedule not made yet'
  if (e.status === 'GENERATED') return 'Schedule ready, no scores yet'
  return 'Scoring in progress'
}
</script>

<template>
  <div class="page">
    <UiState v-if="league.loading && !league.group" kind="loading" title="Loading league" />

    <UiState
      v-else-if="league.error?.status === 403 || league.error?.status === 404"
      kind="denied" heading="h1"
      title="This league isn't available to you"
      body="It may have been archived, or your account isn't on its roster. Ask the organizer to send you an invite link."
      action-label="See your leagues"
      action-to="/groups"
    />
    <UiState
      v-else-if="league.error"
      kind="error" heading="h1"
      title="League didn't load"
      :body="league.error.message"
      @retry="refresh"
    />

    <template v-else-if="league.group">
      <PageHeader :title="league.group.name" back-to="/groups" back-label="All leagues">
        <template #actions>
          <button type="button" class="icon-btn" aria-label="Refresh league" :disabled="refreshing" @click="refresh">
            <RefreshCw :size="20" :class="{ spin: refreshing }" aria-hidden="true" />
          </button>
          <RouterLink v-if="league.isOrganizer" :to="`/groups/${groupId}/settings`" class="icon-btn" aria-label="League settings">
            <Settings :size="20" aria-hidden="true" />
          </RouterLink>
          <AccountButton />
        </template>
      </PageHeader>

      <!-- ORGANIZER: tonight -->
      <section v-if="league.isOrganizer" class="section" aria-labelledby="tonight-h">
        <h2 id="tonight-h">Tonight</h2>
        <UiState v-if="loadingExtras" kind="loading" title="Loading events" />
        <RouterLink v-else-if="active" :to="`/events/${active.id}`" class="tonight">
          <span class="tonight__name">{{ eventTitle(active) }}</span>
          <template v-if="activeProgress">
            <span class="tonight__round num">Round {{ activeProgress.round + 1 }} of {{ active.rounds }}</span>
            <span class="tonight__meta">
              {{ activeProgress.roundScored }} of {{ activeProgress.roundGames.length }} courts scored this round.
              {{ activeProgress.scored }} of {{ activeProgress.total }} games overall.
            </span>
            <span class="pips-label" aria-hidden="true">Courts this round</span>
            <span class="pips" aria-hidden="true">
              <span
                v-for="g in activeProgress.roundGames"
                :key="g.id"
                class="pip"
                :class="{ 'pip--done': g.scoreTeam1 != null && g.scoreTeam2 != null }"
              >{{ g.courtIndex + 1 }}</span>
            </span>
          </template>
          <span v-else class="tonight__meta">{{ statusLine(active) }}. {{ active.courts }} courts, {{ active.rounds }} rounds.</span>
        </RouterLink>
        <p v-else class="muted">No event in progress. Start one when players arrive.</p>

        <ul v-if="otherUnfinished.length" role="list" class="list">
          <li v-for="e in otherUnfinished" :key="e.id" class="list__row">
            <RouterLink :to="`/events/${e.id}`" class="list__main">
              <CalendarClock :size="20" aria-hidden="true" />
              <span class="list__text">
                <span class="truncate list__title">{{ eventTitle(e) }}</span>
                <span class="muted list__sub">{{ statusLine(e) }}</span>
              </span>
            </RouterLink>
            <button type="button" class="icon-btn" :aria-label="`Delete ${eventTitle(e)}`" @click="removeEvent(e)">
              <Trash2 :size="20" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>

      <!-- PLAYER: your standing -->
      <section v-else class="section" aria-labelledby="you-h">
        <h2 id="you-h">Your standing</h2>
        <RouterLink v-if="league.me" :to="`/groups/${groupId}/players/${league.me.id}`" class="mine">
          <span class="mine__rank num">{{ myRank ? `#${myRank.rank}` : 'Unranked' }}</span>
          <span class="mine__detail">
            <span><span class="num mine__rating">{{ Math.round(league.me.rating) }}</span> rating</span>
            <span class="muted">{{ league.me.wins }} wins, {{ league.me.losses }} losses<template v-if="league.me.ties">, {{ league.me.ties }} ties</template></span>
          </span>
          <ChevronRight :size="20" aria-hidden="true" />
        </RouterLink>
        <p v-else class="muted">Your account isn't linked to a player in this league yet. Ask the organizer for your invite link.</p>
        <p class="muted readonly">Scores are entered by league organizers on game night.</p>
      </section>

      <section class="section" aria-labelledby="stand-h">
        <div class="section-head">
          <h2 id="stand-h">Standings</h2>
          <RouterLink :to="`/groups/${groupId}/rankings`" class="more">All rankings</RouterLink>
        </div>
        <UiState v-if="loadingExtras && !rankings.length" kind="loading" title="Loading standings" />
        <p v-else-if="!rankings.length" class="muted">Standings appear after the first completed event.</p>
        <div v-else>
          <StandingRow
            v-for="r in rankings.slice(0, 5)"
            :key="r.playerId"
            :rank="r.rank"
            :name="r.displayName"
            :rating="r.rating"
            :wins="r.wins"
            :losses="r.losses"
            :ties="r.ties"
            :is-me="!!league.me && r.playerId === league.me.playerId"
            :to="profileId(r.playerId) ? `/groups/${groupId}/players/${profileId(r.playerId)}` : undefined"
          />
        </div>
      </section>

      <section v-if="!league.isOrganizer && myGames.length" class="section" aria-labelledby="games-h">
        <div class="section-head">
          <h2 id="games-h">Your recent games</h2>
          <RouterLink :to="{ path: `/groups/${groupId}/history`, query: { playerId: league.me?.playerId } }" class="more">All games</RouterLink>
        </div>
        <CourtTile
          v-for="m in myGames"
          :key="m.gameId"
          :court="m.courtIndex + 1"
          :team1="m.team1"
          :team2="m.team2"
          :score1="m.scoreTeam1"
          :score2="m.scoreTeam2"
          state="final"
          :caption="`${m.eventName || 'Event'}, ${formatDay(m.date)}`"
        />
      </section>

      <section v-if="league.isOrganizer && recentEvents.length" class="section" aria-labelledby="recent-h">
        <div class="section-head">
          <h2 id="recent-h">Recent events</h2>
          <RouterLink :to="`/groups/${groupId}/history`" class="more">History</RouterLink>
        </div>
        <ul role="list" class="list">
          <li v-for="e in recentEvents" :key="e.id" class="list__row">
            <RouterLink :to="`/events/${e.id}`" class="list__main">
              <span class="list__text">
                <span class="truncate list__title">{{ eventTitle(e) }}</span>
                <span class="muted list__sub">{{ e.startsAt ? formatDay(e.startsAt) : 'Completed' }}, {{ e.courts }} courts</span>
              </span>
              <ChevronRight :size="18" aria-hidden="true" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <RouterLink v-if="league.isOrganizer && league.trackPayments" :to="`/groups/${groupId}/payments`" class="list__row list__main payments">
        <Wallet :size="20" aria-hidden="true" />
        <span class="list__title">Sub payments</span>
        <ChevronRight :size="18" aria-hidden="true" />
      </RouterLink>

      <ActionBar v-if="league.isOrganizer" above-tabs>
        <template v-if="active" #meta>
          <template v-if="activeProgress">{{ activeProgress.remaining }} of {{ activeProgress.total }} games still need scores.</template>
          <template v-else>{{ statusLine(active) }}.</template>
        </template>
        <template v-else #meta>
          {{ permanentCount }} regulars on the roster. Each court needs 4 players.
        </template>
        <UiButton v-if="active" variant="primary" size="lg" :to="`/events/${active.id}`">
          {{ activeProgress ? `Resume scoring, round ${activeProgress.round + 1}` : 'Open event' }}
        </UiButton>
        <UiButton v-else variant="primary" size="lg" :to="`/groups/${groupId}/events/new`">Start an event</UiButton>
      </ActionBar>
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

.more {
  display: inline-flex; align-items: center;
  min-height: var(--tap);
  font-weight: 700;
  text-decoration: none;
}

.tonight {
  display: flex;
  flex-direction: column;
  gap: var(--s1);
  padding: var(--s4);
  border-radius: var(--r-tile);
  background: var(--court);
  color: var(--on-court);
  text-decoration: none;
}
.tonight__name { font-weight: 700; }
.tonight__round { font-size: var(--text-xl); line-height: 1.1; }
.tonight__meta { font-size: var(--text-sm); }
.pips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.pip {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 32px; height: 32px;
  padding: 0 6px;
  border-radius: 6px;
  border: 2px solid var(--on-court);
  font-family: var(--font-num);
  font-weight: 700;
  font-size: var(--text-md);
}
.pip--done { background: var(--on-court); color: var(--court); border-color: var(--on-court); }
.pip--done::after { content: '✓'; font-family: var(--font-ui); font-size: 13px; margin-left: 3px; }
.pips-label { font-size: var(--text-xs); font-weight: 700; margin-top: var(--s2); }

.mine {
  display: flex;
  align-items: center;
  gap: var(--s4);
  padding: var(--s4);
  border-radius: var(--r-tile);
  background: var(--court-tint);
  color: var(--ink);
  text-decoration: none;
}
.mine__rank { font-size: var(--text-xl); min-width: 3ch; }
.mine__detail { flex: 1; display: flex; flex-direction: column; }
.mine__rating { font-size: var(--text-lg); }
.readonly { font-size: var(--text-sm); }

.list { display: flex; flex-direction: column; }
.list__row {
  display: flex;
  align-items: center;
  gap: var(--s2);
  border-bottom: 1px solid var(--line);
}
.list__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: 56px;
  color: var(--ink);
  text-decoration: none;
}
.list__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.list__title { font-weight: 700; }
.list__sub { font-size: var(--text-sm); }
.payments { border-top: 1px solid var(--line); }
.payments .list__title { flex: 1; }
</style>
