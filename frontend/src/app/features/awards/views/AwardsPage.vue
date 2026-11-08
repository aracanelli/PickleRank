<script setup lang="ts">
/**
 * League awards. Organizers create an edition (stat awards frozen from rankings and history),
 * add voting categories, open voting, then close it to show results. Members vote while it is open.
 * Tallies only exist once voting is closed; the API leaves them out before that.
 * Members see stat awards and results only after the organizer publishes; they can vote while voting is open.
 */
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshCw, Plus, Trash2, Link2, Eye, EyeOff } from 'lucide-vue-next'
import { useLeagueStore } from '@/stores/league'
import { awardsApi } from '../services/awards.api'
import { rankingsApi } from '@/app/features/rankings/services/rankings.api'
import { api } from '@/app/core/http/api-client'
import type { AwardEditionDto, AwardCategoryDto } from '@/app/core/models/dto'
import { computeStatAwards } from '../utils/awards-derivations'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import AccountButton from '@/app/core/layout/AccountButton.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiState from '@/app/core/ui/UiState.vue'
import ActionBar from '@/app/core/ui/ActionBar.vue'
import { confirm, toast } from '@/app/core/ui/feedback'
import StatAwardCard from '../components/StatAwardCard.vue'
import VotingCategoryCard from '../components/VotingCategoryCard.vue'
import AwardResultsCard from '../components/AwardResultsCard.vue'
import VoteSheet from '../components/VoteSheet.vue'
import CategoryManagerSheet from '../components/CategoryManagerSheet.vue'

const route = useRoute()
const league = useLeagueStore()
const groupId = computed(() => route.params.groupId as string)

const edition = ref<AwardEditionDto | null>(null)
const loading = ref(true)
const loadError = ref('')
const refreshing = ref(false)
const creating = ref(false)
const mutating = ref(false)
const showCategorySheet = ref(false)
const voteCategoryId = ref<string | null>(null)
const savingVote = ref<string | null>(null)

const errMsg = (e: unknown, fallback: string) => (e as { message?: string }).message || fallback

async function load() {
  loading.value = true
  loadError.value = ''
  await league.load(groupId.value)
  if (!league.error) {
    try {
      edition.value = (await awardsApi.getAwards(groupId.value)) ?? null
    } catch (e) {
      loadError.value = errMsg(e, 'Check your connection and try again.')
    }
  }
  loading.value = false
}
watch(groupId, () => { void load() }, { immediate: true })

/** Re-read after a change without flashing the loading state. */
async function reload() {
  try {
    edition.value = (await awardsApi.getAwards(groupId.value)) ?? null
  } catch (e) {
    toast(errMsg(e, 'Awards did not refresh. Pull the latest with Refresh.'), 'bad')
  }
}

async function refresh() {
  refreshing.value = true
  api.invalidateCache(`/api/groups/${groupId.value}/awards`)
  api.invalidateCache(`/api/groups/${groupId.value}`)
  await league.load(groupId.value, true)
  await load()
  refreshing.value = false
  if (!loadError.value && !league.error) toast('Awards refreshed')
}

// --- Stat-award divisions (Regulars vs Everyone incl. subs) ---
const division = ref<'PERMANENT' | 'ALL'>('PERMANENT')
// Old snapshots have no division field; treat them as a single ALL pool.
const hasDivisionSplit = computed(() => {
  const list = edition.value?.statAwards ?? []
  return list.some(a => a.division === 'PERMANENT') && list.some(a => (a.division ?? 'ALL') === 'ALL')
})
const statAwards = computed(() => {
  const list = edition.value?.statAwards ?? []
  return hasDivisionSplit.value ? list.filter(a => (a.division ?? 'ALL') === division.value) : list
})

// Members reach an unpublished edition only while voting is open; the API strips its stat awards.
const statsHidden = computed(() => !edition.value?.publishedAt && !league.isOrganizer)
const categories = computed(() => edition.value?.categories ?? [])
const voted = computed(() => categories.value.filter(c => c.myVote).length)
const voteCategory = computed(() => categories.value.find(c => c.id === voteCategoryId.value) ?? null)
const nameFor = (gpId?: string | null) => (gpId ? league.players.find(p => p.id === gpId)?.displayName ?? null : null)

const subtitle = computed(() => {
  switch (edition.value?.status) {
    case 'DRAFT': return 'Voting has not opened yet.'
    case 'VOTING_OPEN': return 'Voting is open. Results stay hidden until the organizer closes voting.'
    case 'CLOSED': return 'Voting is closed. Results are final.'
    default: return undefined
  }
})

// --- Organizer actions ---
async function createAwards() {
  if (!league.group || creating.value) return
  creating.value = true
  try {
    const [r, h] = await Promise.all([rankingsApi.getRankings(groupId.value), rankingsApi.getHistory(groupId.value)])
    const awards = computeStatAwards({ rankings: r.rankings, matches: h.matches, players: league.players })
    await awardsApi.createEdition(groupId.value, { title: `${league.group.name} awards`, statAwards: awards })
    toast('Awards created')
    await reload()
  } catch (e) {
    toast(errMsg(e, 'Awards not created. Try again.'), 'bad')
  } finally {
    creating.value = false
  }
}

async function setStatus(status: 'VOTING_OPEN' | 'CLOSED', ask: { title: string; body: string; confirmLabel: string }, done: string) {
  if (!edition.value || mutating.value) return
  if (!(await confirm(ask))) return
  mutating.value = true
  try {
    await awardsApi.updateEdition(groupId.value, edition.value.id, { status })
    toast(done)
    await reload()
  } catch (e) {
    toast(errMsg(e, 'Awards not updated. Try again.'), 'bad')
  } finally {
    mutating.value = false
  }
}

const openVoting = () => setStatus('VOTING_OPEN', {
  title: 'Open voting?',
  body: 'Members with a linked player can vote once in each category. You cannot add categories after this.',
  confirmLabel: 'Open voting'
}, 'Voting opened')

const closeVoting = () => setStatus('CLOSED', {
  title: 'Close voting and show results?',
  body: edition.value?.publishedAt
    ? 'Votes are locked and everyone in the league sees the results. You can reopen voting later.'
    : 'Votes are locked. Members see the results once you publish the awards. You can reopen voting later.',
  confirmLabel: 'Close voting'
}, 'Voting closed. Results are showing.')

const reopenVoting = () => setStatus('VOTING_OPEN', {
  title: 'Reopen voting?',
  body: 'Results are hidden again and members can change their votes.',
  confirmLabel: 'Reopen voting'
}, 'Voting reopened')

// Publishing works in any status, even with no categories. Members then see the season awards and results.
async function setPublished(published: boolean) {
  if (!edition.value || mutating.value) return
  if (!published && !(await confirm({
    title: 'Unpublish awards?',
    body: 'Members stop seeing the season awards and results. Open voting stays open.',
    confirmLabel: 'Unpublish'
  }))) return
  mutating.value = true
  try {
    await awardsApi.setPublished(groupId.value, edition.value.id, published)
    toast(published ? 'Awards published. Members can see them.' : 'Awards unpublished')
    await reload()
  } catch (e) {
    toast(errMsg(e, 'Awards not updated. Try again.'), 'bad')
  } finally {
    mutating.value = false
  }
}

async function deleteCategory(c: AwardCategoryDto) {
  const ok = await confirm({ title: `Delete ${c.title}?`, body: 'Any votes cast in this category are lost.', confirmLabel: 'Delete category', danger: true })
  if (!ok) return
  try {
    await awardsApi.deleteCategory(groupId.value, c.id)
    toast('Category deleted')
    await reload()
  } catch (e) {
    toast(errMsg(e, 'Category not deleted. Try again.'), 'bad')
  }
}

async function deleteEdition() {
  if (!edition.value) return
  const ok = await confirm({
    title: 'Delete these awards?',
    body: 'The season awards, every category, and all votes are removed. This cannot be undone.',
    confirmLabel: 'Delete awards',
    danger: true
  })
  if (!ok) return
  try {
    await awardsApi.deleteEdition(groupId.value, edition.value.id)
    toast('Awards deleted')
    await reload()
  } catch (e) {
    toast(errMsg(e, 'Awards not deleted. Try again.'), 'bad')
  }
}

// --- Voting ---
async function vote(nomineeId: string) {
  const c = voteCategory.value
  if (!c || savingVote.value) return
  savingVote.value = nomineeId
  try {
    await awardsApi.vote(groupId.value, c.id, nomineeId)
    toast(`Vote saved: ${nameFor(nomineeId) ?? 'player'} for ${c.title}`)
    voteCategoryId.value = null
    await reload()
  } catch (e) {
    toast(errMsg(e, 'Vote not saved. Try again.'), 'bad')
  } finally {
    savingVote.value = null
  }
}
</script>

<template>
  <div class="page">
    <UiState v-if="(loading || league.loading) && !league.group" kind="loading" title="Loading awards" />

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
        :title="edition?.title || 'Awards'"
        :back-to="`/groups/${groupId}`"
        :back-label="league.group.name"
        :subtitle="subtitle"
      >
        <template #actions>
          <button type="button" class="icon-btn" aria-label="Refresh awards" :disabled="refreshing" @click="refresh">
            <RefreshCw :size="20" :class="{ spin: refreshing }" aria-hidden="true" />
          </button>
          <AccountButton />
        </template>
      </PageHeader>

      <UiState v-if="loading" kind="loading" title="Loading awards" />
      <UiState v-else-if="loadError" kind="error" title="Awards didn't load" :body="loadError" @retry="refresh" />

      <template v-else-if="!edition">
        <UiState
          v-if="league.isOrganizer"
          kind="empty"
          title="No awards yet"
          body="Create awards to hand out season honors from your rankings and game history. Then add categories for members to vote on."
        />
        <UiState
          v-else
          kind="empty"
          title="No awards yet"
          body="When the organizer wraps up the season, the league awards appear here."
        />
        <ActionBar v-if="league.isOrganizer" above-tabs>
          <template #meta>Uses rankings and game history as of today.</template>
          <UiButton variant="primary" size="lg" :loading="creating" @click="createAwards">Create awards</UiButton>
        </ActionBar>
      </template>

      <template v-else>
        <!-- Visibility: organizers always see everything; members only after publish -->
        <section v-if="league.isOrganizer" class="section publish" aria-labelledby="publish-h">
          <h2 id="publish-h">Visibility</h2>
          <p class="publish__status" :class="{ 'publish__status--live': edition.publishedAt }">
            <component :is="edition.publishedAt ? Eye : EyeOff" :size="20" aria-hidden="true" />
            <span>{{ edition.publishedAt
              ? 'Members can see these awards.'
              : edition.status === 'VOTING_OPEN' ? 'Only organizers can see these. Members can still vote.' : 'Only organizers can see these.' }}</span>
          </p>
          <UiButton v-if="!edition.publishedAt" variant="primary" :loading="mutating" @click="setPublished(true)">Publish awards</UiButton>
          <UiButton v-else variant="secondary" :loading="mutating" @click="setPublished(false)">Unpublish</UiButton>
        </section>

        <!-- Draft: organizer sets up categories -->
        <section v-if="edition.status === 'DRAFT' && league.isOrganizer" class="section" aria-labelledby="cats-h">
          <div class="section-head">
            <h2 id="cats-h">Voting categories</h2>
            <UiButton variant="quiet" @click="showCategorySheet = true">
              <Plus :size="18" aria-hidden="true" />Add category
            </UiButton>
          </div>
          <p v-if="!categories.length" class="muted">Add at least one category before opening voting.</p>
          <ul v-else role="list">
            <li v-for="c in categories" :key="c.id" class="row-item">
              <span class="row-item__text">
                <span class="row-item__title">{{ c.title }}</span>
                <span v-if="c.description" class="muted row-item__sub">{{ c.description }}</span>
              </span>
              <button type="button" class="icon-btn icon-btn--bad" :aria-label="`Delete ${c.title}`" @click="deleteCategory(c)">
                <Trash2 :size="20" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>

        <!-- Voting open: everyone -->
        <section v-else-if="edition.status === 'VOTING_OPEN'" class="section" aria-labelledby="vote-h">
          <div class="section-head">
            <h2 id="vote-h">Vote</h2>
            <span v-if="edition.canVote && categories.length" class="muted"><span class="num">{{ voted }}</span> of <span class="num">{{ categories.length }}</span> done</span>
          </div>
          <div v-if="!edition.canVote" class="notice">
            <Link2 :size="20" aria-hidden="true" />
            <p>Your account isn't linked to a player in this league, so you can't vote. {{ league.isOrganizer ? 'Link yourself from the roster with an invite link to vote.' : 'Ask the organizer for your invite link.' }}</p>
          </div>
          <p v-if="!categories.length" class="muted">No voting categories were set up.</p>
          <ul v-else role="list">
            <li v-for="c in categories" :key="c.id">
              <VotingCategoryCard :category="c" :my-vote-name="nameFor(c.myVote)" :can-vote="edition.canVote" @vote-click="voteCategoryId = c.id" />
            </li>
          </ul>
        </section>

        <!-- Closed: results for everyone -->
        <section v-else-if="edition.status === 'CLOSED'" class="section" aria-labelledby="results-h">
          <h2 id="results-h">Voting results</h2>
          <p v-if="!categories.length" class="muted">No voting categories were set up.</p>
          <ul v-else role="list">
            <li v-for="c in categories" :key="c.id">
              <AwardResultsCard :category="c" :group-id="groupId" />
            </li>
          </ul>
        </section>

        <!-- Season awards -->
        <section class="section" aria-labelledby="season-h">
          <h2 id="season-h">Season awards</h2>
          <p v-if="statsHidden" class="muted">Season awards show here once the organizer publishes them.</p>
          <p v-else-if="!statAwards.length" class="muted">Not enough games were played to award season honors.</p>
          <template v-else>
            <template v-if="hasDivisionSplit">
              <fieldset class="seg">
                <legend class="visually-hidden">Players counted</legend>
                <label class="seg__opt">
                  <input v-model="division" type="radio" name="award-division" value="PERMANENT" class="visually-hidden">
                  <span>Regulars</span>
                </label>
                <label class="seg__opt">
                  <input v-model="division" type="radio" name="award-division" value="ALL" class="visually-hidden">
                  <span>Everyone</span>
                </label>
              </fieldset>
              <p class="muted note">{{ division === 'PERMANENT' ? 'Counts regulars only.' : 'Includes subs.' }}</p>
            </template>
            <ul role="list">
              <li v-for="a in statAwards" :key="`${a.division ?? 'ALL'}:${a.key}`">
                <StatAwardCard :award="a" :group-id="groupId" />
              </li>
            </ul>
          </template>
        </section>

        <section v-if="league.isOrganizer" class="section danger-zone" aria-labelledby="manage-h">
          <h2 id="manage-h">Start over</h2>
          <p class="muted">Deleting removes the season awards, categories, and votes so you can create them again.</p>
          <UiButton variant="danger" @click="deleteEdition">
            <Trash2 :size="18" aria-hidden="true" />Delete awards
          </UiButton>
        </section>

        <ActionBar v-if="league.isOrganizer" above-tabs>
          <template #meta>
            <template v-if="edition.status === 'DRAFT'">
              {{ categories.length ? `${categories.length} ${categories.length === 1 ? 'category' : 'categories'} ready.` : 'Add a category to open voting.' }}
            </template>
            <template v-else-if="edition.status === 'VOTING_OPEN'">Results are hidden until you close voting.</template>
            <template v-else>Reopening hides results and lets members change votes.</template>
          </template>
          <UiButton v-if="edition.status === 'DRAFT'" :variant="edition.publishedAt ? 'primary' : 'secondary'" size="lg" :disabled="!categories.length" :loading="mutating" @click="openVoting">Open voting</UiButton>
          <UiButton v-else-if="edition.status === 'VOTING_OPEN'" :variant="edition.publishedAt ? 'primary' : 'secondary'" size="lg" :loading="mutating" @click="closeVoting">Close voting and show results</UiButton>
          <UiButton v-else variant="secondary" size="lg" :loading="mutating" @click="reopenVoting">Reopen voting</UiButton>
        </ActionBar>

        <CategoryManagerSheet
          v-if="league.isOrganizer"
          :open="showCategorySheet"
          :group-id="groupId"
          :edition-id="edition.id"
          :count="categories.length"
          @close="showCategorySheet = false"
          @changed="reload"
        />
        <VoteSheet
          :open="!!voteCategory"
          :players="league.players"
          :current-vote="voteCategory?.myVote ?? null"
          :title="voteCategory?.title"
          :description="voteCategory?.description"
          :saving="savingVote"
          @close="voteCategoryId = null"
          @select="vote"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
.icon-btn {
  width: var(--tap); height: var(--tap);
  display: grid; place-items: center;
  flex: none;
  border: 0; border-radius: 50%;
  background: transparent;
  color: var(--ink);
}
.icon-btn:hover { background: var(--surface-sunk); }
.icon-btn--bad { color: var(--bad); }
.spin { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: var(--s3) 0 0;
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

.row-item {
  display: flex;
  align-items: center;
  gap: var(--s2);
  min-height: 56px;
  border-bottom: 1px solid var(--line);
}
.row-item__text { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: var(--s2) 0; }
.row-item__title { font-weight: 700; overflow-wrap: anywhere; }
.row-item__sub { font-size: var(--text-sm); }

.notice {
  display: flex;
  gap: var(--s3);
  margin-bottom: var(--s3);
  padding: var(--s3);
  border-radius: var(--r-tile);
  background: var(--wait-tint);
  color: var(--ink);
}
.notice svg { flex: none; margin-top: 2px; }

.publish { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s3); }
.publish__status { display: flex; gap: var(--s2); align-items: flex-start; font-weight: 700; color: var(--ink-2); }
.publish__status svg { flex: none; margin-top: 2px; }
.publish__status--live { color: var(--ink); }

.danger-zone { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s3); }
</style>
