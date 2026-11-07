<script setup lang="ts">
/**
 * One player in one league: rating, record, recent form and games, rating over time,
 * partners and opponents, and a way into head to head.
 * Visible to every member; organizers also get a shortcut to edit the player.
 */
import { ref, computed, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'chart.js'
import { Line } from 'vue-chartjs'
import { useLeagueStore } from '@/stores/league'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { rankingsApi } from '@/app/features/rankings/services/rankings.api'
import type { PlayerStats, TeammateStat, RankingEntryDto, MatchHistoryEntryDto } from '@/app/core/models/dto'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import AccountButton from '@/app/core/layout/AccountButton.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiState from '@/app/core/ui/UiState.vue'
import CourtTile from '@/app/core/ui/CourtTile.vue'
import { toast } from '@/app/core/ui/feedback'
import { ratingSeries, signed, type SeriesPoint } from '../ratingSeries'
import { computeFormGuide } from '../utils/form-guide'
import { sortNewestFirst } from '@/app/features/rankings/utils/match-derivations'
import { formatDay } from '@/app/features/events/eventProgress'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

const route = useRoute()
const league = useLeagueStore()
const groupId = computed(() => route.params.groupId as string)
const playerId = computed(() => route.params.playerId as string)

const stats = ref<PlayerStats | null>(null)
// rank is optional: a failed rankings call only hides it
const ranked = ref<RankingEntryDto[]>([])
const loading = ref(true)
const error = ref<{ status?: number; message: string } | null>(null)
// round-by-round view of one event, opened from the chart
const drill = ref<{ name: string; points: SeriesPoint[] } | null>(null)
// form and recent games are optional: a failed history call only hides them
const games = ref<MatchHistoryEntryDto[]>([])

async function loadStats() {
  loading.value = true
  error.value = null
  drill.value = null
  rankingsApi.getRankings(groupId.value).then(r => { ranked.value = r.rankings }).catch(() => { ranked.value = [] })
  try {
    const [s] = await Promise.all([groupsApi.getPlayerStats(groupId.value, playerId.value), league.load(groupId.value)])
    stats.value = s
    games.value = []
    // history filters take the global player id
    rankingsApi.getHistory(groupId.value, { playerId: s.player.playerId })
      .then(r => { if (stats.value?.player.id === s.player.id) games.value = r.matches })
      .catch(() => { games.value = [] })
  } catch (e) {
    const err = e as { status?: number; message?: string }
    error.value = { status: err.status, message: err.message || 'Stats did not load.' }
    stats.value = null
  } finally {
    loading.value = false
  }
}
watch([groupId, playerId], () => { void loadStats() }, { immediate: true })

const p = computed(() => stats.value?.player ?? null)
const rank = computed(() => ranked.value.find(r => r.playerId === p.value?.playerId)?.rank)
const isMe = computed(() => !!p.value && league.me?.id === p.value.id)
const summary = computed(() => {
  const x = p.value
  if (!x) return ''
  const parts = [x.membershipType === 'SUB' ? `Sub, ${(x.skillLevel ?? 'INTERMEDIATE').toLowerCase()}` : 'Regular']
  if (x.role === 'ORGANIZER') parts.push('organizer')
  return parts.join(', ')
})
// teammate and opponent stats carry the group player id; accept a global id too
const profileId = (id: string) => league.players.find(gp => gp.id === id || gp.playerId === id)?.id

// ---- form and recent games (history team ids are group player ids) ----
const form = computed(() => (p.value ? computeFormGuide(games.value, p.value.id) : []))
const FORM_WORD = { W: 'won', L: 'lost', T: 'tied' } as const
const formLabel = computed(() => `Last ${form.value.length} games, newest first: ${form.value.map(o => FORM_WORD[o]).join(', ')}`)
const recentGames = computed(() => sortNewestFirst(games.value).slice(0, 3))
// you against them when you're looking at someone else; otherwise pick an opponent there
const h2hQuery = computed(() => {
  const x = p.value
  if (!x) return ''
  return league.me && !isMe.value ? `${league.me.playerId},${x.playerId}` : x.playerId
})

// ---- chart ----
const series = computed(() => ratingSeries(stats.value?.history ?? []))
const drilling = ref(false)
const shown = computed(() => drill.value?.points ?? series.value)
const chartSummary = computed(() => {
  const s = shown.value
  if (s.length < 2) return ''
  const first = s[0].rating, last = s[s.length - 1].rating
  const span = drill.value ? `the ${s.length - 1} rounds of ${drill.value.name}` : `${s.length - 1} ${s.length === 2 ? 'event' : 'events'}`
  return `Rating went from ${Math.round(first)} to ${Math.round(last)} over ${span}.`
})

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

const chartData = computed(() => {
  const court = cssVar('--court', '#1e5aa8')
  return {
    labels: shown.value.map(h => h.label),
    datasets: [{
      label: 'Rating',
      data: shown.value.map(h => h.rating),
      borderColor: court,
      backgroundColor: cssVar('--court-tint', '#e6eef8'),
      pointBackgroundColor: court,
      pointRadius: 4,
      pointHoverRadius: 7,
      pointHitRadius: 16,
      fill: true,
      tension: 0.25
    }]
  }
})

const chartOptions = computed(() => {
  const ink2 = cssVar('--ink-2', '#44546a')
  const line = cssVar('--line', '#c9d2dd')
  const font = { family: cssVar('--font-ui', 'system-ui, sans-serif'), size: 14 }
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    onClick: (_e: unknown, els: { index: number }[]) => { if (els.length) void openEvent(shown.value[els[0].index]) },
    interaction: { mode: 'nearest' as const, axis: 'x' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        titleFont: { ...font, weight: 'bold' as const },
        bodyFont: font,
        callbacks: {
          title: (items: { dataIndex: number }[]) => shown.value[items[0].dataIndex]?.title ?? '',
          label: (item: { parsed: { y: number } }) => `Rating ${item.parsed.y.toFixed(1)}`,
          afterLabel: (item: { dataIndex: number }) => {
            const h = shown.value[item.dataIndex]
            return h.start ? 'Starting rating' : `Change ${signed(h.delta)}`
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false }, border: { color: line }, ticks: { color: ink2, font, maxRotation: 0, autoSkip: true, maxTicksLimit: 4 } },
      y: { grid: { color: line }, border: { color: line }, ticks: { color: ink2, font, maxTicksLimit: 5 } }
    }
  }
})

async function openEvent(h: SeriesPoint | undefined) {
  if (!h?.eventId || drill.value || drilling.value || !p.value) return
  drilling.value = true
  try {
    const map = await groupsApi.getEventRatingHistory(h.eventId)
    // keyed by group player id; fall back to the global id in case the backend keys that way
    const rows = map[p.value.id] ?? map[p.value.playerId]
    if (!Array.isArray(rows) || !rows.length) {
      toast(`No round-by-round ratings for ${h.title}`, 'bad')
      return
    }
    drill.value = {
      name: h.title,
      points: rows.map(r => ({ label: r.label, title: r.label, rating: r.rating, delta: r.delta ?? 0 }))
    }
  } catch (e) {
    toast((e as { message?: string }).message || 'Round-by-round ratings did not load.', 'bad')
  } finally {
    drilling.value = false
  }
}

// ---- advanced ----
const adv = computed(() => stats.value?.advanced ?? null)
const currentStreak = computed(() => {
  const a = adv.value
  if (!a) return ''
  if (a.currentWinStreak > 0) return `${a.currentWinStreak} ${a.currentWinStreak === 1 ? 'win' : 'wins'}`
  if (a.currentLossStreak > 0) return `${a.currentLossStreak} ${a.currentLossStreak === 1 ? 'loss' : 'losses'}`
  return 'None'
})
const pct = (r: number) => `${Math.round(r * 100)}%`
const partnerLists = computed(() => adv.value
  ? [
      { key: 'best', title: 'Best partners', list: adv.value.bestTeammates },
      { key: 'worst', title: 'Toughest partnerships', list: adv.value.worstTeammates }
    ]
  : [])
const opponents = computed(() => {
  const a = adv.value
  const out: { key: string; label: string; t: TeammateStat }[] = []
  if (a?.nemesis) out.push({ key: 'nem', label: 'Loses most to', t: a.nemesis })
  if (a?.pigeon) out.push({ key: 'pig', label: 'Beats most often', t: a.pigeon })
  return out
})
</script>

<template>
  <div class="page">
    <UiState v-if="loading && !stats" kind="loading" title="Loading player" />
    <UiState
      v-else-if="error?.status === 403 || error?.status === 404"
      heading="h1"
      kind="denied"
      title="This player isn't available"
      body="They may have left the league, or you're not on this league's roster."
      action-label="Back to league"
      :action-to="`/groups/${groupId}`"
    />
    <UiState v-else-if="error" heading="h1" kind="error" title="Player stats didn't load" :body="error.message" @retry="loadStats" />

    <template v-else-if="p">
      <PageHeader :title="p.displayName" :back-to="`/groups/${groupId}`" :back-label="league.group?.name || 'League'" :subtitle="isMe ? `${summary}. This is you.` : summary">
        <template #actions><AccountButton /></template>
      </PageHeader>

      <div class="standing">
        <span v-if="rank" class="standing__rank num">#{{ rank }}</span>
        <span class="standing__detail">
          <span><span class="num standing__rating">{{ Math.round(p.rating) }}</span> rating</span>
          <span class="muted">{{ p.wins }} {{ p.wins === 1 ? 'win' : 'wins' }}, {{ p.losses }} {{ p.losses === 1 ? 'loss' : 'losses' }}<template v-if="p.ties">, {{ p.ties }} {{ p.ties === 1 ? 'tie' : 'ties' }}</template></span>
        </span>
        <span v-if="form.length" class="form" role="img" :aria-label="formLabel">
          <span class="form__label" aria-hidden="true">Form</span>
          <span class="form__row" aria-hidden="true">
            <span v-for="(o, i) in form" :key="i" class="form__o num" :class="`form__o--${o}`">{{ o }}</span>
          </span>
        </span>
      </div>

      <div class="links">
        <UiButton :to="{ path: `/groups/${groupId}/history`, query: { playerId: p.playerId } }">
          {{ isMe ? 'Your games' : 'All games' }}
        </UiButton>
        <UiButton :to="{ path: `/groups/${groupId}/history`, query: { h2h: h2hQuery } }">
          Head to head
        </UiButton>
        <UiButton v-if="league.isOrganizer" :to="{ path: `/groups/${groupId}/players/manage`, query: { edit: p.id } }">Edit player</UiButton>
      </div>

      <section class="section" aria-labelledby="chart-h">
        <div class="section-head">
          <h2 id="chart-h" class="truncate">{{ drill ? `Rounds in ${drill.name}` : 'Rating over time' }}</h2>
          <UiButton v-if="drill" variant="quiet" @click="drill = null">All events</UiButton>
        </div>
        <p v-if="series.length < 2" class="muted">The chart appears after this player's first completed event.</p>
        <template v-else>
          <div class="chart" role="img" :aria-label="chartSummary" :aria-busy="drilling || undefined">
            <Line :data="chartData" :options="chartOptions as any" aria-label="Rating over time. The same data is listed under Rating by event." />
          </div>
          <p class="muted small">{{ chartSummary }}<template v-if="!drill"> Tap an event to see its rounds.</template></p>
          <details v-if="!drill" class="events">
            <summary>Rating by event</summary>
            <ul role="list">
              <li v-for="(h, i) in series" :key="i" class="ev">
                <span class="ev__name truncate">{{ h.title }}</span>
                <span class="num">{{ Math.round(h.rating) }}</span>
                <span class="num ev__delta">{{ h.start ? 'start' : signed(h.delta) }}</span>
                <UiButton v-if="h.eventId" variant="quiet" :aria-label="`Rounds in ${h.title}`" @click="openEvent(h)">Rounds</UiButton>
              </li>
            </ul>
          </details>
        </template>
      </section>

      <section v-if="recentGames.length" class="section" aria-labelledby="recent-h">
        <h2 id="recent-h">Recent games</h2>
        <ol role="list" class="games">
          <li v-for="m in recentGames" :key="m.gameId">
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
      </section>

      <section v-if="adv" class="section" aria-labelledby="ins-h">
        <h2 id="ins-h">Streaks and matchups</h2>
        <dl class="facts">
          <div class="fact"><dt>Highest rating</dt><dd class="num">{{ Math.round(adv.highestRating) }}</dd></div>
          <div class="fact"><dt>Lowest rating</dt><dd class="num">{{ Math.round(adv.lowestRating) }}</dd></div>
          <div class="fact"><dt>Longest win streak</dt><dd class="num">{{ adv.longestWinStreak }}</dd></div>
          <div class="fact"><dt>Current streak</dt><dd>{{ currentStreak }}</dd></div>
          <div v-for="o in opponents" :key="o.key" class="fact">
            <dt>{{ o.label }}</dt>
            <dd class="fact__who">
              <RouterLink v-if="profileId(o.t.playerId)" :to="`/groups/${groupId}/players/${profileId(o.t.playerId)}`" class="truncate">{{ o.t.displayName }}</RouterLink>
              <span v-else class="truncate">{{ o.t.displayName }}</span>
              <span class="muted small nowrap">{{ o.t.wins }} won, {{ o.t.losses }} lost</span>
            </dd>
          </div>
        </dl>

        <div v-for="l in partnerLists" :key="l.key" class="stack-sm">
          <h3>{{ l.title }}</h3>
          <p v-if="!l.list.length" class="muted small">Not enough games together yet.</p>
          <ul v-else role="list" class="partners">
            <li v-for="t in l.list" :key="t.playerId">
              <RouterLink v-if="profileId(t.playerId)" :to="`/groups/${groupId}/players/${profileId(t.playerId)}`" class="partner">
                <span class="truncate partner__name">{{ t.displayName }}</span>
                <span class="num">{{ pct(t.winRate) }}</span>
                <span class="muted small nowrap">{{ t.gamesPlayed }} games</span>
                <ChevronRight :size="16" aria-hidden="true" />
              </RouterLink>
              <span v-else class="partner">
                <span class="truncate partner__name">{{ t.displayName }}</span>
                <span class="num">{{ pct(t.winRate) }}</span>
                <span class="muted small nowrap">{{ t.gamesPlayed }} games</span>
              </span>
            </li>
          </ul>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.standing {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s4);
  padding: var(--s4);
  border-radius: var(--r-tile);
  background: var(--court-tint);
  color: var(--ink);
}
.standing__rank { font-size: var(--text-xl); min-width: 3ch; }
.standing__detail { flex: 1; display: flex; flex-direction: column; }
.standing__rating { font-size: var(--text-lg); }

.links { display: flex; flex-wrap: wrap; gap: var(--s2); }
.links > * { flex: 1 1 9.5rem; }

.chart { position: relative; height: 220px; width: 100%; }
.small { font-size: var(--text-sm); }
.nowrap { white-space: nowrap; }

.events summary { min-height: var(--tap); display: flex; align-items: center; font-weight: 700; cursor: pointer; color: var(--court); }
.ev {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 4.5ch auto;
  align-items: center;
  gap: var(--s2);
  min-height: var(--tap);
  border-bottom: 1px solid var(--line);
}
.ev__delta { text-align: right; color: var(--ink-2); }

.facts { display: flex; flex-direction: column; margin: 0; }
.fact {
  display: flex; align-items: center; justify-content: space-between; gap: var(--s3);
  min-height: var(--tap);
  border-bottom: 1px solid var(--line);
}
.fact dt { flex: none; }
.fact dd { margin: 0; font-weight: 700; min-width: 0; }
.fact__who { display: flex; flex-direction: column; align-items: flex-end; text-align: right; }
.fact__who a, .fact__who > .truncate { max-width: 100%; }

.partners { display: flex; flex-direction: column; }
.partner {
  display: flex; align-items: center; gap: var(--s3);
  min-height: var(--tap);
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  text-decoration: none;
}
.partner__name { flex: 1; font-weight: 700; }

.form { flex-basis: 100%; display: flex; align-items: center; gap: var(--s3); }
.form__label { font-size: var(--text-sm); font-weight: 700; }
.form__row { display: flex; gap: 4px; }
.form__o {
  display: grid; place-items: center;
  width: 28px; height: 28px;
  border-radius: 6px;
  font-weight: 700;
  font-size: var(--text-md);
  background: var(--surface);
  color: var(--ink);
}
.form__o--W { background: var(--ok-tint); color: var(--ok); }
.form__o--L { background: var(--bad-tint); color: var(--bad); }
.games { display: flex; flex-direction: column; gap: var(--s3); list-style: none; margin: 0; padding: 0; }
</style>
