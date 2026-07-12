<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Trophy, Share2, Loader2, ChevronUp, ChevronDown, Minus } from 'lucide-vue-next'
import { useMediaQuery } from '@vueuse/core'
import html2canvas from 'html2canvas'
import { rankingsApi } from '../services/rankings.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { api } from '@/app/core/http/api-client'
import type { RankingEntryDto, GroupDto, GroupPlayerDto } from '@/app/core/models/dto'
import { useAuthStore } from '@/stores/auth'
import { useGroupContextStore, type GroupRole } from '@/stores/group-context'
import { useToast } from '@/app/core/ui/composables/useToast'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import HeaderActions from '@/app/core/layout/HeaderActions.vue'
import IconButton from '@/app/core/ui/components/IconButton.vue'
import PullRefresh from '@/app/core/ui/components/PullRefresh.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import SegmentedControl from '@/app/core/ui/components/SegmentedControl.vue'
import ResponsiveTable, { type TableColumn } from '@/app/core/ui/components/ResponsiveTable.vue'
import PodiumStrip from '@/app/features/groups/components/dashboard/PodiumStrip.vue'
import type { PodiumItem } from '@/app/features/groups/components/dashboard/types'
import ShareableRankings from '../components/ShareableRankings.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()
const toast = useToast()

const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const rankings = ref<RankingEntryDto[]>([])
const groupPlayers = ref<GroupPlayerDto[]>([])
const isLoading = ref(true)
const error = ref('')

// Filter state: 'permanent' or 'all'
const filterType = ref<'permanent' | 'all'>('permanent')
const filterOptions = [
  { label: 'Permanent', value: 'permanent' },
  { label: 'All players', value: 'all' }
]

// Export functionality
const isExporting = ref(false)
const shareableRef = ref<HTMLElement | null>(null)

onMounted(loadData)

async function loadData() {
  isLoading.value = true
  error.value = ''
  try {
    const [groupRes, rankingsRes, playersRes] = await Promise.all([
      groupsApi.get(groupId.value),
      rankingsApi.getRankings(groupId.value),
      groupsApi.getPlayers(groupId.value)
    ])
    group.value = groupRes
    rankings.value = rankingsRes.rankings
    groupPlayers.value = playersRes.players
    syncGroupContext()
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load rankings')
  } finally {
    isLoading.value = false
  }
}

// Populate the group context store (replaces the legacy sessionStorage myPlayerId)
function syncGroupContext() {
  if (!group.value) return
  const userId = authStore.userId
  const myPlayer = groupPlayers.value.find((p) => p.userId && p.userId === userId) || null
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

// The signed-in user's player id (rankings entries are keyed by playerId)
const myRankingPlayerId = computed(() => {
  const userId = authStore.userId
  if (!userId) return null
  return groupPlayers.value.find((p) => p.userId && p.userId === userId)?.playerId ?? null
})

// Pull-to-refresh: invalidate all cached data for this group first
async function refreshData() {
  api.invalidateCache(`/api/groups/${groupId.value}/rankings`)
  api.invalidateCache(`/api/groups/${groupId.value}/players`)
  api.invalidateCache(`/api/groups/${groupId.value}`)
  await loadData()
}

// Lookup maps built from group players (rankings entries have no membership/delta)
const membershipMap = computed(() => {
  const map = new Map<string, 'PERMANENT' | 'SUB'>()
  groupPlayers.value.forEach((p) => map.set(p.playerId, p.membershipType))
  return map
})

const ratingDeltaMap = computed(() => {
  const map = new Map<string, number | undefined>()
  groupPlayers.value.forEach((p) => map.set(p.playerId, p.ratingDelta))
  return map
})

function getRatingDelta(playerId: string): number | undefined {
  return ratingDeltaMap.value.get(playerId)
}

function isSub(playerId: string): boolean {
  return membershipMap.value.get(playerId) === 'SUB'
}

// Filter rankings based on membership type
const filteredRankings = computed(() => {
  if (filterType.value === 'all') return rankings.value
  return rankings.value.filter((r) => {
    const membership = membershipMap.value.get(r.playerId)
    return !membership || membership === 'PERMANENT'
  })
})

// Previous ranks (rating - delta), relative to the current filtered view
const previousRanksMap = computed(() => {
  const map = new Map<string, number>()
  const playersWithPrevRating = filteredRankings.value.map((r) => {
    const delta = ratingDeltaMap.value.get(r.playerId) || 0
    return { playerId: r.playerId, previousRating: r.rating - delta }
  })
  const sorted = [...playersWithPrevRating].sort((a, b) => b.previousRating - a.previousRating)
  sorted.forEach((player, index) => map.set(player.playerId, index + 1))
  return map
})

// Positive = moved up, negative = moved down, 0 = no change
function getRankChange(playerId: string, currentRank: number): number {
  const prevRank = previousRanksMap.value.get(playerId)
  if (prevRank === undefined) return 0
  return prevRank - currentRank
}

const hasRecentChanges = computed(() =>
  groupPlayers.value.some((p) => p.ratingDelta !== undefined && p.ratingDelta !== 0)
)

// Rows carry their display rank so table cells + cards share it
interface RankedEntry extends RankingEntryDto {
  displayRank: number
}
const rankedEntries = computed<RankedEntry[]>(() =>
  filteredRankings.value.map((entry, index) => ({ ...entry, displayRank: index + 1 }))
)

// --- Podium hero: top-3 of the filtered view as 2-1-3 stepped plinths -------
const podiumItems = computed<PodiumItem[]>(() => {
  if (rankedEntries.value.length < 3) return []
  return rankedEntries.value.slice(0, 3).map((entry) => ({
    rank: entry.displayRank,
    playerId: entry.playerId,
    groupPlayerId: groupPlayers.value.find((p) => p.playerId === entry.playerId)?.id,
    name: entry.displayName,
    rating: entry.rating,
    delta: ratingDeltaMap.value.get(entry.playerId)
  }))
})

// Ladder list: ranks 4+ once the podium takes the top three, all otherwise.
// Desktop keeps the full-column table with every rank.
const isDesktop = useMediaQuery('(min-width: 768px)')
const ladderEntries = computed<RankedEntry[]>(() =>
  podiumItems.value.length === 3 && !isDesktop.value
    ? rankedEntries.value.slice(3)
    : rankedEntries.value
)

function recordCaption(entry: RankedEntry): string {
  return `${entry.wins}-${entry.losses}-${entry.ties} · ${entry.gamesPlayed} GP`
}

const columns: TableColumn[] = [
  { key: 'rank', label: '#', align: 'center' },
  { key: 'player', label: 'Player' },
  { key: 'rating', label: 'Rating', align: 'right' },
  { key: 'gp', label: 'GP', align: 'center' },
  { key: 'wins', label: 'W', align: 'center' },
  { key: 'losses', label: 'L', align: 'center' },
  { key: 'ties', label: 'T', align: 'center' },
  { key: 'winRate', label: 'Win %', align: 'right' }
]

function openPlayer(entry: RankedEntry) {
  // Rankings entries carry the global player id; the profile route (and the
  // stats endpoint behind it) expects the group-player id.
  const groupPlayerId = groupPlayers.value.find((p) => p.playerId === entry.playerId)?.id
  if (!groupPlayerId) return
  router.push(`/groups/${groupId.value}/players/${groupPlayerId}`)
}

// Export as image (ported verbatim from the legacy page, incl. Web Share / iOS fallback)
async function exportAsImage() {
  if (!shareableRef.value) return

  isExporting.value = true
  try {
    // Target the ShareableRankings component directly (it's the first child)
    const targetEl = shareableRef.value.querySelector('.shareable-rankings') as HTMLElement
    if (!targetEl) return

    // Get the actual bounding box of the content for tight cropping
    const rect = targetEl.getBoundingClientRect()

    const canvas = await html2canvas(targetEl, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
      width: rect.width,
      height: rect.height,
      windowWidth: rect.width,
      windowHeight: rect.height
    })

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })

    if (!blob) return

    const fileName = `${group.value?.name || 'group'}-rankings.png`

    // Check if Web Share API is available (best for mobile)
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], fileName, { type: 'image/png' })
      const shareData = { files: [file] }

      if (navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData)
          return
        } catch (shareError) {
          // User cancelled or share failed, fall through to other methods
          if ((shareError as Error).name !== 'AbortError') {
            console.log('Share failed, trying fallback...')
          }
        }
      }
    }

    // Check if iOS (for long-press save fallback)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const url = URL.createObjectURL(blob)

    if (isIOS) {
      // Open image in new window - user can long-press to save
      window.open(url, '_blank')
      // Revoke blob URL after a short delay to allow the new window to fetch the blob
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } else {
      // Standard download for desktop
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  } catch (e) {
    console.error('Failed to export image:', e)
    toast.error('Failed to export image')
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <HeaderActions>
    <IconButton
      v-if="!isLoading && filteredRankings.length > 0"
      label="Share rankings"
      :disabled="isExporting"
      @click="exportAsImage"
    >
      <Loader2 v-if="isExporting" class="size-5 animate-spin" />
      <Share2 v-else class="size-5" />
    </IconButton>
  </HeaderActions>

  <PullRefresh :on-refresh="refreshData">
    <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5">
      <SkeletonList v-if="isLoading" :rows="6" avatar />

      <ErrorState v-else-if="error" :message="error" @retry="loadData" />

      <div v-else class="flex flex-col gap-4">
        <!-- Masthead -->
        <header>
          <p class="eyebrow text-ink-faint">{{ group?.name || 'Standings' }}</p>
          <h1 class="display-wide mt-1 text-3xl text-ink">Ladder</h1>
          <div class="kitchen-line mt-3" />
        </header>

        <SegmentedControl v-if="rankings.length > 0" v-model="filterType" :options="filterOptions" />

        <AppEmptyState
          v-if="filteredRankings.length === 0"
          title="No rankings yet"
          :description="
            filterType === 'permanent'
              ? 'No permanent players have rankings yet.'
              : 'Complete some events to see player rankings here.'
          "
          court
        >
          <template #icon><Trophy class="size-7" /></template>
        </AppEmptyState>

        <template v-else>
          <!-- Podium hero: 2 — 1 — 3, staggered plinth rise (reduced-motion safe) -->
          <PodiumStrip
            v-if="podiumItems.length === 3"
            :key="filterType"
            :items="podiumItems"
            :group-id="groupId"
          />

          <ResponsiveTable
            :columns="columns"
            :items="ladderEntries"
            :item-key="(e) => e.playerId"
            clickable
            @row-click="openPlayer"
          >
            <!-- Mobile ladder row -->
            <template #card="{ item }">
              <div class="flex items-center gap-3 p-3.5">
                <span class="numeral w-8 shrink-0 text-center text-2xl leading-none text-ink-muted">
                  {{ item.displayRank }}
                </span>
                <Avatar
                  :name="item.displayName"
                  :seed="item.playerId"
                  :brand="item.playerId === myRankingPlayerId"
                />
                <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    class="flex items-center gap-1.5 truncate text-sm font-semibold"
                    :class="item.playerId === myRankingPlayerId ? 'text-accent-text' : 'text-ink'"
                  >
                    <span class="truncate">{{ item.displayName }}</span>
                    <TapeChip v-if="isSub(item.playerId)" variant="warn">Sub</TapeChip>
                  </span>
                  <span class="truncate font-mono text-xs tabular-nums text-ink-faint">
                    {{ recordCaption(item) }}
                  </span>
                </div>
                <div class="flex shrink-0 flex-col items-end gap-0.5">
                  <span class="flex items-baseline gap-1.5">
                    <span class="numeral h-6 text-xl leading-6 text-ink">{{ item.rating.toFixed(1) }}</span>
                    <span
                      v-if="getRatingDelta(item.playerId)"
                      class="numeral h-4 text-xs leading-4"
                      :class="getRatingDelta(item.playerId)! > 0 ? 'text-win' : 'text-loss'"
                    >
                      {{ getRatingDelta(item.playerId)! > 0 ? '▲' : '▼' }}
                      {{ Math.abs(getRatingDelta(item.playerId)!).toFixed(2) }}
                    </span>
                  </span>
                  <span
                    v-if="getRankChange(item.playerId, item.displayRank) > 0"
                    class="numeral flex items-center text-xs text-win"
                  >
                    <ChevronUp class="size-3.5" />{{ getRankChange(item.playerId, item.displayRank) }}
                  </span>
                  <span
                    v-else-if="getRankChange(item.playerId, item.displayRank) < 0"
                    class="numeral flex items-center text-xs text-loss"
                  >
                    <ChevronDown class="size-3.5" />{{ Math.abs(getRankChange(item.playerId, item.displayRank)) }}
                  </span>
                  <Minus v-else-if="hasRecentChanges" class="size-3 text-ink-faint" />
                </div>
              </div>
            </template>

            <!-- Desktop cells -->
            <template #cell-rank="{ item }">
              <div class="relative flex flex-col items-center gap-0.5">
                <!-- 2px volt left edge on top-3 rows (offsets cancel the cell padding) -->
                <span
                  v-if="item.displayRank <= 3"
                  class="absolute -bottom-3 -left-4 -top-3 w-0.5 bg-accent-fill"
                  aria-hidden="true"
                />
                <span
                  class="numeral text-xl leading-6"
                  :class="item.displayRank <= 3 ? 'text-accent-text' : 'text-ink-muted'"
                >
                  {{ item.displayRank }}
                </span>
                <span
                  v-if="getRankChange(item.playerId, item.displayRank) > 0"
                  class="numeral flex items-center text-xs text-win"
                >
                  <ChevronUp class="size-3" />{{ getRankChange(item.playerId, item.displayRank) }}
                </span>
                <span
                  v-else-if="getRankChange(item.playerId, item.displayRank) < 0"
                  class="numeral flex items-center text-xs text-loss"
                >
                  <ChevronDown class="size-3" />{{ Math.abs(getRankChange(item.playerId, item.displayRank)) }}
                </span>
                <Minus v-else-if="hasRecentChanges" class="size-3 text-ink-faint" />
              </div>
            </template>
            <template #cell-player="{ item }">
              <div class="flex items-center gap-2.5">
                <Avatar
                  :name="item.displayName"
                  :seed="item.playerId"
                  size="sm"
                  :brand="item.playerId === myRankingPlayerId"
                />
                <span
                  class="font-medium"
                  :class="item.playerId === myRankingPlayerId ? 'text-accent-text' : 'text-ink'"
                >
                  {{ item.displayName }}
                </span>
                <TapeChip v-if="isSub(item.playerId)" variant="warn">Sub</TapeChip>
              </div>
            </template>
            <template #cell-rating="{ item }">
              <div class="flex items-baseline justify-end gap-1.5">
                <span class="numeral h-6 text-xl leading-6 text-ink">{{ item.rating.toFixed(1) }}</span>
                <span
                  v-if="getRatingDelta(item.playerId)"
                  class="numeral h-4 text-xs leading-4"
                  :class="getRatingDelta(item.playerId)! > 0 ? 'text-win' : 'text-loss'"
                >
                  {{ getRatingDelta(item.playerId)! > 0 ? '▲' : '▼' }}
                  {{ Math.abs(getRatingDelta(item.playerId)!).toFixed(2) }}
                </span>
              </div>
            </template>
            <template #cell-gp="{ item }">
              <span class="font-mono tabular-nums text-ink-muted">{{ item.gamesPlayed }}</span>
            </template>
            <template #cell-wins="{ item }">
              <span class="font-mono tabular-nums text-win">{{ item.wins }}</span>
            </template>
            <template #cell-losses="{ item }">
              <span class="font-mono tabular-nums text-loss">{{ item.losses }}</span>
            </template>
            <template #cell-ties="{ item }">
              <span class="font-mono tabular-nums text-tie">{{ item.ties }}</span>
            </template>
            <template #cell-winRate="{ item }">
              <div class="flex items-center justify-end gap-2">
                <span class="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2">
                  <span
                    class="block h-full rounded-full bg-accent-fill"
                    :style="{ width: `${item.winRate * 100}%` }"
                  />
                </span>
                <span class="font-mono text-sm tabular-nums text-ink-muted">{{ (item.winRate * 100).toFixed(0) }}%</span>
              </div>
            </template>
          </ResponsiveTable>
        </template>
      </div>
    </div>
  </PullRefresh>

  <!-- Hidden container for export (off-screen but still renderable) -->
  <div class="pointer-events-none fixed top-0 -left-[9999px]" aria-hidden="true">
    <div ref="shareableRef">
      <ShareableRankings
        v-if="group"
        :rankings="filteredRankings"
        :group-name="group.name"
        :rating-system="group.settings.ratingSystem"
      />
    </div>
  </div>
</template>
