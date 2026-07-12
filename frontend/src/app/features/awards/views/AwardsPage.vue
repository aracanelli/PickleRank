<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Trophy, Plus, Trash2, Link2 } from 'lucide-vue-next'
import { awardsApi } from '../services/awards.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { rankingsApi } from '@/app/features/rankings/services/rankings.api'
import { api } from '@/app/core/http/api-client'
import type { GroupDto, AwardEditionDto } from '@/app/core/models/dto'
import { useAuthStore } from '@/stores/auth'
import { useGroupContextStore, type GroupRole } from '@/stores/group-context'
import { useToast } from '@/app/core/ui/composables/useToast'
import { useConfirm } from '@/app/core/ui/composables/useConfirm'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import { usePlayerIndex } from '@/app/features/players/composables/usePlayerIndex'
import { useCelebration } from '@/app/features/events/composables/useCelebration'
import { computeStatAwards } from '../utils/awards-derivations'
import HeaderActions from '@/app/core/layout/HeaderActions.vue'
import IconButton from '@/app/core/ui/components/IconButton.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import PullRefresh from '@/app/core/ui/components/PullRefresh.vue'
import SegmentedControl from '@/app/core/ui/components/SegmentedControl.vue'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import LiveDot from '@/app/core/ui/components/LiveDot.vue'
import CourtLines from '@/app/core/ui/components/CourtLines.vue'
import StatAwardCard from '../components/StatAwardCard.vue'
import VotingCategoryCard from '../components/VotingCategoryCard.vue'
import AwardResultsCard from '../components/AwardResultsCard.vue'
import VoteSheet from '../components/VoteSheet.vue'
import CategoryManagerSheet from '../components/CategoryManagerSheet.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()
const toast = useToast()
const { confirm } = useConfirm()
const { flashVisible, celebrate, skip } = useCelebration()

const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const edition = ref<AwardEditionDto | null>(null)
const isLoading = ref(true)
const error = ref('')
const isCreating = ref(false)
const isMutating = ref(false)

const showCategorySheet = ref(false)
const showVoteSheet = ref(false)
const activeCategoryId = ref<string | null>(null)
const hasCelebrated = ref(false)

const playerIndex = usePlayerIndex(groupId)

onMounted(() => loadData())

async function loadData(silent = false) {
  if (!silent) isLoading.value = true
  error.value = ''
  try {
    const [editionRes, groupRes] = await Promise.all([
      awardsApi.getAwards(groupId.value),
      groupsApi.get(groupId.value),
      playerIndex.load()
    ])
    if (playerIndex.error.value) throw new Error(playerIndex.error.value)
    group.value = groupRes
    edition.value = editionRes
    syncGroupContext()
    maybeCelebrate()
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load awards')
  } finally {
    isLoading.value = false
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

function maybeCelebrate() {
  if (edition.value?.status === 'CLOSED' && !hasCelebrated.value) {
    hasCelebrated.value = true
    void celebrate()
  }
}

const canManage = computed(() => groupContext.canManage)

const statusChip = computed(() => {
  switch (edition.value?.status) {
    case 'VOTING_OPEN':
      return { variant: 'live' as const, label: 'Voting open', live: true }
    case 'CLOSED':
      return { variant: 'win' as const, label: 'Final', live: false }
    default:
      return { variant: 'muted' as const, label: 'Setup', live: false }
  }
})

// --- Stat-award divisions (Regulars vs Everyone incl. subs) ------------------

const divisionFilter = ref('PERMANENT')
const divisionOptions = [
  { label: 'Regulars', value: 'PERMANENT' },
  { label: 'Everyone', value: 'ALL' }
]
// Old snapshots have no division field; treat them as a single ALL pool.
const hasDivisionSplit = computed(() => {
  const list = edition.value?.statAwards ?? []
  return list.some((a) => a.division === 'PERMANENT') && list.some((a) => (a.division ?? 'ALL') === 'ALL')
})
const visibleStatAwards = computed(() => {
  const list = edition.value?.statAwards ?? []
  if (!hasDivisionSplit.value) return list
  return list.filter((a) => (a.division ?? 'ALL') === divisionFilter.value)
})

const categories = computed(() => edition.value?.categories ?? [])
const activeCategory = computed(
  () => categories.value.find((c) => c.id === activeCategoryId.value) ?? null
)

function nameFor(groupPlayerId?: string | null): string | null {
  if (!groupPlayerId) return null
  return playerIndex.byGroupPlayerId.value.get(groupPlayerId)?.displayName ?? null
}

function seedFor(groupPlayerId: string): string | undefined {
  return playerIndex.byGroupPlayerId.value.get(groupPlayerId)?.playerId
}

// --- Organizer: create ------------------------------------------------------

async function createAwards() {
  if (!group.value || isCreating.value) return
  isCreating.value = true
  try {
    const [rankingsRes, historyRes] = await Promise.all([
      rankingsApi.getRankings(groupId.value),
      rankingsApi.getHistory(groupId.value)
    ])
    const statAwards = computeStatAwards({
      rankings: rankingsRes.rankings,
      matches: historyRes.matches,
      players: playerIndex.players.value
    })
    await awardsApi.createEdition(groupId.value, {
      title: `${group.value.name} Awards`,
      statAwards
    })
    toast.success('Awards created')
    await loadData(true)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to create awards'))
  } finally {
    isCreating.value = false
  }
}

// --- Organizer: status transitions -----------------------------------------

async function transition(status: 'DRAFT' | 'VOTING_OPEN' | 'CLOSED', prompt: {
  title: string
  message: string
  confirmLabel: string
  successMessage: string
}) {
  if (!edition.value || isMutating.value) return
  const ok = await confirm({
    title: prompt.title,
    message: prompt.message,
    confirmLabel: prompt.confirmLabel
  })
  if (!ok) return
  isMutating.value = true
  try {
    await awardsApi.updateEdition(groupId.value, edition.value.id, { status })
    toast.success(prompt.successMessage)
    await loadData(true)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to update awards'))
  } finally {
    isMutating.value = false
  }
}

function openVoting() {
  transition('VOTING_OPEN', {
    title: 'Open voting?',
    message: 'Members with a linked player will be able to cast votes. You can still close voting later.',
    confirmLabel: 'Open voting',
    successMessage: 'Voting is open'
  })
}

function closeVoting() {
  transition('CLOSED', {
    title: 'Close voting & reveal?',
    message: 'This locks voting and reveals the results to everyone. You can reopen voting afterwards.',
    confirmLabel: 'Close & reveal',
    successMessage: 'Results are live'
  })
}

function reopenVoting() {
  transition('VOTING_OPEN', {
    title: 'Reopen voting?',
    message: 'Results will be hidden again and members can change their votes.',
    confirmLabel: 'Reopen',
    successMessage: 'Voting reopened'
  })
}

async function deleteCategory(categoryId: string, title: string) {
  const ok = await confirm({
    title: 'Delete category?',
    message: `Delete "${title}"? Any votes cast for it will be lost.`,
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return
  try {
    await awardsApi.deleteCategory(groupId.value, categoryId)
    toast.success('Category deleted')
    await loadData(true)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to delete category'))
  }
}

async function deleteEdition() {
  if (!edition.value) return
  const ok = await confirm({
    title: 'Delete awards?',
    message: 'This permanently deletes this awards edition, its categories, and all votes. This cannot be undone.',
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return
  try {
    await awardsApi.deleteEdition(groupId.value, edition.value.id)
    toast.success('Awards deleted')
    await loadData(true)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to delete awards'))
  }
}

// --- Voting -----------------------------------------------------------------

function openVoteSheet(categoryId: string) {
  activeCategoryId.value = categoryId
  showVoteSheet.value = true
}

async function onVoteSelect(nomineeGroupPlayerId: string) {
  if (!activeCategoryId.value) return
  try {
    await awardsApi.vote(groupId.value, activeCategoryId.value, nomineeGroupPlayerId)
    toast.success('Vote recorded')
    showVoteSheet.value = false
    await loadData(true)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to record vote'))
  }
}

async function refresh() {
  api.invalidateCache(`/api/groups/${groupId.value}/awards`)
  api.invalidateCache(`/api/groups/${groupId.value}`)
  api.invalidateCache(`/api/groups/${groupId.value}/players`)
  await loadData(true)
}
</script>

<template>
  <HeaderActions>
    <IconButton
      v-if="canManage && edition"
      label="Delete awards"
      variant="danger"
      @click="deleteEdition"
    >
      <Trash2 class="size-5" />
    </IconButton>
  </HeaderActions>

  <PullRefresh :on-refresh="refresh">
    <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5">
      <SkeletonList v-if="isLoading" :rows="4" avatar />

      <ErrorState v-else-if="error" :message="error" @retry="loadData()" />

      <!-- No edition yet -->
      <template v-else-if="!edition">
        <AppEmptyState
          v-if="!canManage"
          title="No awards yet"
          description="When your organizer wraps up the season, the club awards will appear here."
          court
        >
          <template #icon><Trophy class="size-7" /></template>
        </AppEmptyState>

        <AppEmptyState
          v-else
          title="Hand out the hardware"
          description="Compute this season's stat awards from your rankings and match history, then open fan voting for the fun categories."
          court
        >
          <template #icon><Trophy class="size-7" /></template>
          <template #action>
            <AppButton variant="broadcast" :loading="isCreating" @click="createAwards">
              Create awards
            </AppButton>
          </template>
        </AppEmptyState>
      </template>

      <!-- Edition present -->
      <div v-else class="flex flex-col gap-6">
        <!-- Masthead -->
        <header class="stadium-glow relative overflow-hidden">
          <CourtLines crop="corner" class="absolute -right-2 -top-3 h-28 w-auto" />
          <div class="relative flex flex-wrap items-center gap-3">
            <h1 class="display-wide min-w-0 break-words text-2xl leading-tight text-ink md:text-4xl">
              {{ edition.title }}
            </h1>
            <TapeChip :variant="statusChip.variant">
              <LiveDot v-if="statusChip.live" />
              {{ statusChip.label }}
            </TapeChip>
          </div>
          <div class="kitchen-line relative mt-3" />
        </header>

        <!-- Stat awards wall -->
        <section v-if="edition.statAwards.length" class="flex flex-col gap-3">
          <h2 class="eyebrow text-ink-faint">Season superlatives</h2>
          <template v-if="hasDivisionSplit">
            <SegmentedControl v-model="divisionFilter" :options="divisionOptions" />
            <p class="text-xs text-ink-faint">
              Regulars counts permanent players only · Everyone includes subs.
            </p>
          </template>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <StatAwardCard
              v-for="award in visibleStatAwards"
              :key="`${award.division ?? 'ALL'}:${award.key}`"
              :award="award"
              :group-id="groupId"
            />
          </div>
        </section>

        <!-- Voting: DRAFT (organizers only) -->
        <section v-if="edition.status === 'DRAFT' && canManage" class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="eyebrow text-ink-faint">Voting categories</h2>
            <AppButton variant="secondary" size="sm" @click="showCategorySheet = true">
              <Plus class="size-4" />
              Add category
            </AppButton>
          </div>

          <div v-if="categories.length" class="flex flex-col gap-2">
            <div
              v-for="category in categories"
              :key="category.id"
              class="flex items-center gap-3 rounded-[14px] border border-line bg-surface-1 p-4"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-ink">{{ category.title }}</p>
                <p v-if="category.description" class="truncate text-xs text-ink-faint">
                  {{ category.description }}
                </p>
              </div>
              <IconButton
                label="Delete category"
                variant="danger"
                @click="deleteCategory(category.id, category.title)"
              >
                <Trash2 class="size-5" />
              </IconButton>
            </div>
          </div>
          <p v-else class="text-sm text-ink-faint">
            Add at least one category before opening fan voting.
          </p>

          <AppButton
            variant="broadcast"
            :disabled="categories.length === 0 || isMutating"
            @click="openVoting"
          >
            Open voting
          </AppButton>
        </section>

        <!-- Voting: VOTING_OPEN (everyone) -->
        <section v-else-if="edition.status === 'VOTING_OPEN'" class="flex flex-col gap-3">
          <h2 class="eyebrow text-ink-faint">Cast your votes</h2>

          <div
            v-if="!edition.canVote"
            class="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-4"
          >
            <Link2 class="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
            <div class="min-w-0 flex-1 text-sm text-ink-muted">
              Link your account to a player to vote in these categories.
            </div>
            <AppButton variant="secondary" size="sm" @click="router.push('/link-player')">
              Link player
            </AppButton>
          </div>

          <div v-if="categories.length" class="flex flex-col gap-2">
            <VotingCategoryCard
              v-for="category in categories"
              :key="category.id"
              :category="category"
              :my-vote-name="nameFor(category.myVote)"
              :can-vote="edition.canVote"
              @vote-click="openVoteSheet(category.id)"
            />
          </div>
          <p v-else class="text-sm text-ink-faint">No voting categories were set up.</p>

          <AppButton
            v-if="canManage"
            variant="broadcast"
            :disabled="isMutating"
            @click="closeVoting"
          >
            Close voting & reveal
          </AppButton>
        </section>

        <!-- Voting: CLOSED (everyone) -->
        <section v-else-if="edition.status === 'CLOSED'" class="flex flex-col gap-3">
          <h2 class="eyebrow text-ink-faint">Fan-voted awards</h2>

          <div v-if="categories.length" class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <AwardResultsCard
              v-for="category in categories"
              :key="category.id"
              :category="category"
              :group-id="groupId"
              :resolve-seed="seedFor"
            />
          </div>
          <p v-else class="text-sm text-ink-faint">No voting categories were set up.</p>

          <div v-if="canManage" class="flex flex-col gap-2 sm:flex-row">
            <AppButton variant="secondary" :disabled="isMutating" @click="reopenVoting">
              Reopen voting
            </AppButton>
            <AppButton variant="danger" @click="deleteEdition">
              <Trash2 class="size-4" />
              Delete awards
            </AppButton>
          </div>
        </section>
      </div>
    </div>
  </PullRefresh>

  <!-- Results reveal flash -->
  <Transition name="flash">
    <div
      v-if="flashVisible"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-surface-page/90"
      @click="skip"
    >
      <div class="text-center">
        <Trophy class="mx-auto size-12 text-accent-text" aria-hidden="true" />
        <p class="display-wide mt-3 text-3xl text-ink">Results are in</p>
      </div>
    </div>
  </Transition>

  <CategoryManagerSheet
    v-if="edition"
    v-model="showCategorySheet"
    :group-id="groupId"
    :edition-id="edition.id"
    :categories="categories"
    @changed="loadData(true)"
  />

  <VoteSheet
    v-model="showVoteSheet"
    :players="playerIndex.players.value"
    :current-vote="activeCategory?.myVote ?? null"
    :title="activeCategory?.title"
    @select="onVoteSelect"
  />
</template>

<style scoped>
.flash-enter-active,
.flash-leave-active {
  transition: opacity 0.25s ease;
}
.flash-enter-from,
.flash-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .flash-enter-active,
  .flash-leave-active {
    transition: none;
  }
}
</style>
