<script setup lang="ts">
/**
 * League home. Organizers see tonight's event and the one next action;
 * players see their own standing and recent games. Both see awards, standings and streaks.
 */
import { ref, computed, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { Settings, RefreshCw, Trash2, Wallet, ChevronRight, CalendarClock, Trophy } from 'lucide-vue-next'
import { useLeagueStore } from '@/stores/league'
import { eventsApi } from '@/app/features/events/services/events.api'
import { rankingsApi } from '@/app/features/rankings/services/rankings.api'
import { paymentsApi } from '@/app/features/payments/services/payments.api'
import { formatMoney } from '@/app/features/payments/money'
import { useGroupHistory, bustGroupHistory } from '@/app/features/rankings/composables/useGroupHistory'
import AwardsTeaser from '@/app/features/awards/components/AwardsTeaser.vue'
import { api } from '@/app/core/http/api-client'
import type { EventDto, EventListItemDto, RankingEntryDto, MatchHistoryEntryDto } from '@/app/core/models/dto'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import AccountButton from '@/app/core/layout/AccountButton.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiState from '@/app/core/ui/UiState.vue'
import StandingRow from '@/app/core/ui/StandingRow.vue'
import Podium from '@/app/core/ui/Podium.vue'
import LeaguePulse from '../components/LeaguePulse.vue'
import LastWeekCard from '../components/LastWeekCard.vue'
import YourWeekCard from '../components/YourWeekCard.vue'
import { lastNight, nightForm, myNight, chase } from '../utils/lastWeek'
import { rankingRows } from '@/app/features/rankings/rankingsView'
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
const totalOwed = ref<number | null>(null)
// last 30 days of league games, shared with other screens for a minute
const recent = useGroupHistory(groupId)

const permanentCount = computed(() => league.players.filter(p => p.membershipType === 'PERMANENT').length)
const activeProgress = computed(() => (active.value && active.value.games.length ? progress(active.value) : null))
const myRank = computed(() => rankings.value.find(r => r.playerId === league.me?.playerId) ?? null)
// Rankings and history use the global player id; profile routes use the league (group player) id.
const profileId = (playerId: string) => league.players.find(p => p.playerId === playerId)?.id
const profileTo = (playerId: string) => {
  const id = profileId(playerId)
  return id ? `/groups/${groupId.value}/players/${id}` : undefined
}
// the league's most recent night; history team ids are group player ids
const night = computed(() => lastNight(recent.matches.value))
const formOf = (playerId: string) => {
  const id = profileId(playerId)
  return id ? nightForm(night.value, id) : undefined
}
// movement since before the last event, over everyone shown on home
const moves = computed(() => new Map(rankingRows(rankings.value, league.players, 'all').map(r => [r.entry.playerId, r])))
const podium = computed(() => rankings.value.slice(0, 3).map(r => ({
  playerId: r.playerId, name: r.displayName, rating: r.rating, wins: r.wins, losses: r.losses, ties: r.ties,
  isMe: !!league.me && r.playerId === league.me.playerId,
  to: profileTo(r.playerId),
  move: moves.value.get(r.playerId)?.rankChange,
  delta: moves.value.get(r.playerId)?.delta,
  form: formOf(r.playerId)
})))
const myWeek = computed(() => (league.me ? myNight(night.value, league.me.id) : null))
const myChase = computed(() => (league.me ? chase(rankings.value, league.me.playerId) : null))
const myMove = computed(() => (league.me ? moves.value.get(league.me.playerId)?.rankChange ?? 0 : 0))

async function loadExtras() {
  loadingExtras.value = true
  const id = groupId.value
  await league.load(id)
  if (league.error) {
    loadingExtras.value = false
    return
  }
  totalOwed.value = null
  const tasks: Promise<unknown>[] = [
    rankingsApi.getRankings(id).then(r => { rankings.value = r.rankings }).catch(() => { rankings.value = [] }),
    recent.load()
  ]
  if (league.isOrganizer) {
    tasks.push(eventsApi.list(id).then(async res => {
      const open = orderUnfinished(res.events.filter(e => e.status !== 'COMPLETED'))
      unfinished.value = open
      recentEvents.value = res.events.filter(e => e.status === 'COMPLETED').slice(0, 3)
      active.value = open[0] ? await eventsApi.get(open[0].id).catch(() => null) : null
    }).catch(() => { unfinished.value = []; active.value = null }))
    if (league.trackPayments) {
      tasks.push(paymentsApi.getBalances(id).then(r => { totalOwed.value = r.totalOwed }).catch(() => { totalOwed.value = null }))
    }
  } else if (league.me) {
    tasks.push(rankingsApi.getHistory(id, { playerId: league.me.playerId }).then(r => { myGames.value = r.matches.slice(0, 3) }).catch(() => { myGames.value = [] }))
  }
  await Promise.all(tasks)
  loadingExtras.value = false
}

watch(groupId, () => { void loadExtras() }, { immediate: true })

/** Scoring in progress first, then the soonest upcoming event, then undated or past drafts, newest first. */
function orderUnfinished(open: EventListItemDto[]) {
  const now = Date.now()
  const at = (e: EventListItemDto) => (e.startsAt ? new Date(e.startsAt).getTime() : NaN)
  const rank = (e: EventListItemDto) => (e.status === 'IN_PROGRESS' ? 0 : at(e) >= now ? 1 : 2)
  return [...open].sort((a, b) =>
    rank(a) - rank(b) || (rank(a) === 1 ? at(a) - at(b) : (at(b) || 0) - (at(a) || 0)))
}

async function refresh() {
  refreshing.value = true
  api.invalidateCache(`/api/groups/${groupId.value}`)
  bustGroupHistory(groupId.value)
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

      <!-- ORGANIZER: tonight. A compact card, not a pinned bar, so standings stay in view. -->
      <section v-if="league.isOrganizer" class="section" aria-labelledby="tonight-h">
        <h2 id="tonight-h" class="visually-hidden">Tonight</h2>
        <UiState v-if="loadingExtras" kind="loading" title="Loading events" />
        <RouterLink
          v-else-if="active"
          :to="`/events/${active.id}`"
          class="tonight"
        >
          <span class="tonight__live" aria-hidden="true" />
          <span class="tonight__text">
            <span class="tonight__name truncate">{{ eventTitle(active) }}</span>
            <span v-if="activeProgress" class="tonight__meta">
              <span class="num">Round {{ activeProgress.round + 1 }} of {{ active.rounds }}.</span>
              {{ activeProgress.roundScored }} of {{ activeProgress.roundGames.length }} courts scored.
            </span>
            <span v-else class="tonight__meta">{{ statusLine(active) }}.</span>
            <span v-if="activeProgress" class="pips" aria-hidden="true">
              <span
                v-for="g in activeProgress.roundGames"
                :key="g.id"
                class="pip"
                :class="{ 'pip--done': g.scoreTeam1 != null && g.scoreTeam2 != null }"
              ><span class="pip__n">{{ g.courtIndex + 1 }}</span></span>
            </span>
          </span>
          <span class="tonight__go">{{ activeProgress ? 'Resume scoring' : 'Open' }}<ChevronRight :size="18" aria-hidden="true" /></span>
        </RouterLink>
        <div v-else class="start">
          <p class="muted start__meta">
            No event in progress.
            <template v-if="!permanentCount">No regulars yet. Each court needs 4 players.</template>
            <template v-else>{{ permanentCount }} regulars on the roster. Each court needs 4 players.</template>
          </p>
          <UiButton v-if="!permanentCount" variant="primary" size="lg" block :to="`/groups/${groupId}/players/manage`">Add players</UiButton>
          <UiButton v-else variant="primary" size="lg" block :to="`/groups/${groupId}/events/new`">Start an event</UiButton>
        </div>

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

      <!-- personal: anyone linked to a player in this league -->
      <YourWeekCard
        v-if="league.me && !loadingExtras"
        :group-id="groupId"
        :me="league.me"
        :rank="myRank?.rank ?? null"
        :rank-change="myMove"
        :week="myWeek"
        :chase="myChase"
      />
      <section v-else-if="!league.isOrganizer && !league.me" class="section" aria-labelledby="you-h">
        <h2 id="you-h">Your standing</h2>
        <p class="muted">Your account isn't linked to a player in this league yet. Ask the organizer for your invite link.</p>
      </section>
      <p v-if="!league.isOrganizer" class="muted readonly">Scores are entered by league organizers on game night.</p>

      <LastWeekCard v-if="night" :group-id="groupId" :night="night" :players="league.players" />

      <AwardsTeaser :group-id="groupId" />

      <section class="section" aria-labelledby="stand-h">
        <div class="section-head">
          <h2 id="stand-h">Standings</h2>
          <RouterLink :to="`/groups/${groupId}/rankings`" class="more">All rankings</RouterLink>
        </div>
        <UiState v-if="loadingExtras && !rankings.length" kind="loading" title="Loading standings" />
        <p v-else-if="!rankings.length" class="muted">Standings appear after the first completed event.</p>
        <div v-else>
          <Podium :entries="podium" />
          <StandingRow
            v-for="r in rankings.slice(3, 5)"
            :key="r.playerId"
            :rank="r.rank"
            :name="r.displayName"
            :rating="r.rating"
            :wins="r.wins"
            :losses="r.losses"
            :ties="r.ties"
            :form="formOf(r.playerId)"
            :is-me="!!league.me && r.playerId === league.me.playerId"
            :to="profileTo(r.playerId)"
          />
        </div>
      </section>

      <LeaguePulse :group-id="groupId" :matches="recent.matches.value" :rankings="rankings" :players="league.players" />

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
        <span class="list__text">
          <span class="list__title">Sub payments</span>
          <span v-if="totalOwed" class="muted list__sub">{{ formatMoney(totalOwed, league.group.settings.paymentSettings?.currency || undefined) }} owed by subs</span>
        </span>
        <ChevronRight :size="18" aria-hidden="true" />
      </RouterLink>

      <RouterLink v-if="league.isOrganizer" :to="`/groups/${groupId}/awards`" class="list__row list__main payments">
        <Trophy :size="20" aria-hidden="true" />
        <span class="list__text">
          <span class="list__title">Generate awards</span>
          <span class="muted list__sub">Season awards from the stats, plus your own categories and a vote</span>
        </span>
        <ChevronRight :size="18" aria-hidden="true" />
      </RouterLink>
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
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s3) var(--s3) var(--s4);
  border-radius: var(--r-tile);
  background: var(--court);
  color: var(--on-court);
  text-decoration: none;
}
.tonight__live {
  flex: none;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--optic);
  box-shadow: 0 0 0 4px rgb(221 240 74 / 0.3);
}
@media (prefers-reduced-motion: no-preference) {
  .tonight__live { animation: live 1.6s var(--ease) infinite alternate; }
  @keyframes live { to { box-shadow: 0 0 0 7px rgb(221 240 74 / 0); } }
}
/* basis lets the button drop below the text at large text sizes */
.tonight__text { flex: 1 1 10rem; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tonight__name { font-weight: 700; }
.tonight__meta { font-size: var(--text-sm); }
.tonight__go {
  flex: 0 1 auto;
  max-width: 100%;
  display: inline-flex; align-items: center; gap: 2px;
  min-height: var(--tap);
  padding: 0 var(--s2) 0 var(--s3);
  border-radius: 999px;
  background: var(--optic);
  color: var(--on-optic);
  font-weight: 700;
}
.start { display: flex; flex-direction: column; gap: var(--s2); }
.start__meta { font-size: var(--text-sm); }
.pips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
/* each pip is a tiny court seen from above: sidelines, a net down the middle, the court number on it */
.pip {
  --pip-line: var(--on-court);
  --pip-fill: var(--court);
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 36px; height: 22px;
  border-radius: 3px;
  border: 2px solid var(--pip-line);
  background: linear-gradient(var(--pip-line), var(--pip-line)) center / 2px 100% no-repeat, var(--pip-fill);
  font-family: var(--font-num);
  font-weight: 700;
  font-size: var(--text-sm);
  line-height: 1;
}
.pip__n { padding: 1px 3px; background: var(--pip-fill); color: var(--pip-line); }
.pip--done { --pip-line: var(--court); --pip-fill: var(--on-court); border-color: var(--on-court); }
.pip--done .pip__n::after { content: '✓'; font-family: var(--font-ui); font-size: 12px; margin-left: 2px; }

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
</style>
