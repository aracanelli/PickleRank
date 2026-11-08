<script setup lang="ts">
/**
 * League rankings. Everyone sees the same read-only table; organizers have no extra actions here.
 * Rank movement and rating change compare against the ratings before the last completed event.
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshCw, Share2, ChevronUp, ChevronDown } from 'lucide-vue-next'
import { useLeagueStore } from '@/stores/league'
import { rankingsApi } from '../services/rankings.api'
import { api } from '@/app/core/http/api-client'
import type { RankingEntryDto } from '@/app/core/models/dto'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import AccountButton from '@/app/core/layout/AccountButton.vue'
import UiState from '@/app/core/ui/UiState.vue'
import StandingRow from '@/app/core/ui/StandingRow.vue'
import Podium from '@/app/core/ui/Podium.vue'
import { useGroupHistory, bustGroupHistory } from '../composables/useGroupHistory'
import { lastNight, nightForm } from '@/app/features/groups/utils/lastWeek'
import { toast } from '@/app/core/ui/feedback'
import { shareElementAsImage, safeFileName } from '@/app/core/ui/shareImage'
import ShareableRankings from '../components/ShareableRankings.vue'
import { rankingRows, ratingSystemLabel, signed, type RankingFilter } from '../rankingsView'

const route = useRoute()
const league = useLeagueStore()
const groupId = computed(() => route.params.groupId as string)

const rankings = ref<RankingEntryDto[]>([])
const loading = ref(true)
const loadError = ref('')
const refreshing = ref(false)
const sharing = ref(false)
const filter = ref<RankingFilter>('permanent')
const shareEl = ref<HTMLElement | null>(null)

const rows = computed(() => rankingRows(rankings.value, league.players, filter.value))
// last-week dots come from the shared 30-day history; history team ids are group player ids
const recent = useGroupHistory(groupId)
const night = computed(() => lastNight(recent.matches.value))
const form = (profileId?: string) => (profileId ? nightForm(night.value, profileId) : undefined)
const podium = computed(() => rows.value.slice(0, 3).map(r => ({
  playerId: r.entry.playerId,
  name: r.entry.displayName,
  rating: r.entry.rating,
  wins: r.entry.wins,
  losses: r.entry.losses,
  ties: r.entry.ties,
  isMe: !!league.me && r.entry.playerId === league.me.playerId,
  to: r.profileId ? `/groups/${groupId.value}/players/${r.profileId}` : undefined,
  move: r.rankChange,
  delta: r.delta,
  form: form(r.profileId)
})))
const subCount = computed(() => rankings.value.length - rankingRows(rankings.value, league.players, 'permanent').length)

async function load() {
  loading.value = true
  loadError.value = ''
  await league.load(groupId.value)
  if (!league.error) {
    try {
      rankings.value = (await rankingsApi.getRankings(groupId.value)).rankings
      void recent.load()
    } catch (e) {
      loadError.value = (e as { message?: string }).message || 'Check your connection and try again.'
    }
  }
  loading.value = false
}
watch(groupId, () => { void load() }, { immediate: true })

async function refresh() {
  refreshing.value = true
  api.invalidateCache(`/api/groups/${groupId.value}`)
  bustGroupHistory(groupId.value)
  await league.load(groupId.value, true)
  await load()
  refreshing.value = false
  if (!loadError.value && !league.error) toast('Rankings refreshed')
}

async function share() {
  if (!league.group) return
  sharing.value = true
  try {
    await nextTick()
    const el = shareEl.value?.firstElementChild as HTMLElement | null
    if (el) await shareElementAsImage(el, `${safeFileName(league.group.name)}-rankings.png`)
  } catch {
    toast('Image not created. Try again.', 'bad')
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <div class="page">
    <UiState v-if="(loading || league.loading) && !league.group" kind="loading" title="Loading rankings" />

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
      <PageHeader
        title="Rankings"
        :back-to="`/groups/${groupId}`"
        :back-label="league.group.name"
        :subtitle="`${ratingSystemLabel(league.group.settings.ratingSystem)} ratings`"
      >
        <template #actions>
          <button type="button" class="icon-btn" aria-label="Refresh rankings" :disabled="refreshing" @click="refresh">
            <RefreshCw :size="20" :class="{ spin: refreshing }" aria-hidden="true" />
          </button>
          <button
            v-if="rows.length"
            type="button"
            class="icon-btn"
            aria-label="Share rankings as image"
            :disabled="sharing"
            :aria-busy="sharing || undefined"
            @click="share"
          >
            <Share2 :size="20" aria-hidden="true" />
          </button>
          <AccountButton />
        </template>
      </PageHeader>

      <UiState v-if="loading && !rankings.length" kind="loading" title="Loading rankings" />
      <UiState v-else-if="loadError" kind="error" title="Rankings didn't load" :body="loadError" @retry="refresh" />
      <UiState
        v-else-if="!rankings.length"
        kind="empty"
        title="No rankings yet"
        :body="league.isOrganizer ? 'Rankings appear after you complete the first event.' : 'Rankings appear after the organizer completes the first event.'"
      />

      <template v-else>
        <fieldset v-if="subCount" class="seg">
          <legend class="visually-hidden">Show</legend>
          <label class="seg__opt">
            <input v-model="filter" type="radio" name="rank-filter" value="permanent" class="visually-hidden">
            <span>Regulars</span>
          </label>
          <label class="seg__opt">
            <input v-model="filter" type="radio" name="rank-filter" value="all" class="visually-hidden">
            <span>Everyone</span>
          </label>
        </fieldset>
        <p v-if="filter === 'permanent' && subCount" class="muted note">
          Ranks count regulars only. {{ subCount }} {{ subCount === 1 ? 'sub is' : 'subs are' }} hidden.
        </p>

        <UiState
          v-if="!rows.length"
          kind="empty"
          title="No regulars ranked yet"
          body="Only subs have played so far. Choose Everyone to see them."
        />
        <template v-else>
        <Podium :entries="podium" />
        <ol v-if="rows.length > 3" role="list" class="ranks" aria-label="Rankings from 4th">
          <li v-for="row in rows.slice(3)" :key="row.entry.playerId" class="rank">
            <StandingRow
              :rank="row.rank"
              :name="row.entry.displayName"
              :rating="row.entry.rating"
              :wins="row.entry.wins"
              :losses="row.entry.losses"
              :ties="row.entry.ties"
              :sub="row.sub"
              :form="form(row.profileId)"
              :is-me="!!league.me && row.entry.playerId === league.me.playerId"
              :to="row.profileId ? `/groups/${groupId}/players/${row.profileId}` : undefined"
            />
            <!-- always rendered so every row is the same height; empty when nothing moved -->
            <p class="rank__more num">
              <span v-if="row.rankChange > 0" class="move move--up">
                <ChevronUp :size="16" aria-hidden="true" />Up {{ row.rankChange }}
              </span>
              <span v-else-if="row.rankChange < 0" class="move move--down">
                <ChevronDown :size="16" aria-hidden="true" />Down {{ -row.rankChange }}
              </span>
              <span v-if="row.delta">{{ signed(row.delta) }} last week</span>
            </p>
          </li>
        </ol>
        </template>
      </template>

      <div ref="shareEl" class="offscreen" aria-hidden="true">
        <ShareableRankings
          v-if="sharing"
          :rows="rows"
          :group-name="league.group.name"
          :rating-system="league.group.settings.ratingSystem"
        />
      </div>
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

.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: var(--s4) 0 0;
  padding: 4px;
  border: 0;
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
.note { font-size: var(--text-sm); margin-top: var(--s2); }

.ranks { list-style: none; margin: var(--s3) 0 0; padding: 0; }
.rank { border-bottom: 1px solid var(--line); padding-bottom: var(--s2); }
/* the detail line belongs to the row above, so the row's own divider moves below it */
.rank :deep(.srow) { border-bottom: 0; }
.rank__more {
  display: flex;
  align-items: baseline;
  gap: var(--s3);
  height: 1.5rem;
  overflow: hidden;
  white-space: nowrap;
  margin: calc(var(--s1) * -1) 0 0 calc(2.25rem + 28px + var(--s3) * 2);
  font-size: var(--text-md);
  line-height: 1.5rem;
  color: var(--ink-2);
}
.move { display: inline-flex; align-items: baseline; gap: 2px; font-weight: 700; }
.move svg { align-self: center; }
.move--up { color: var(--ok); }
.move--down { color: var(--bad); }

.offscreen { position: fixed; left: -10000px; top: 0; }
</style>
