<script setup lang="ts">
import { ArrowLeft, Trophy, Medal, Download, TrendingUp, TrendingDown, ChevronUp, ChevronDown, Minus } from 'lucide-vue-next'
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { rankingsApi } from '../services/rankings.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import type { RankingEntryDto, GroupDto, GroupPlayerDto } from '@/app/core/models/dto'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import SkeletonLoader from '@/app/core/ui/components/SkeletonLoader.vue'
import EmptyState from '@/app/core/ui/components/EmptyState.vue'
import ShareableRankings from '../components/ShareableRankings.vue'
import PullToRefresh from '@/app/core/ui/components/PullToRefresh.vue'
import html2canvas from 'html2canvas'


const route = useRoute()



const groupId = computed(() => route.params.groupId as string)



const group = ref<GroupDto | null>(null)
const rankings = ref<RankingEntryDto[]>([])
const groupPlayers = ref<GroupPlayerDto[]>([])
const isLoading = ref(true)
const error = ref('')

// Filter state: 'permanent' or 'all'
const filterType = ref<'permanent' | 'all'>('permanent')

// Export functionality
const isExporting = ref(false)
const shareableRef = ref<HTMLElement | null>(null)

onMounted(async () => {
  await loadData()
})

async function loadData() {
  isLoading.value = true
  try {
    const [groupRes, rankingsRes, playersRes] = await Promise.all([
      groupsApi.get(groupId.value),
      rankingsApi.getRankings(groupId.value),
      groupsApi.getPlayers(groupId.value)
    ])
    group.value = groupRes
    rankings.value = rankingsRes.rankings
    groupPlayers.value = playersRes.players
  } catch (e: any) {
    error.value = e.message || 'Failed to load rankings'
  } finally {
    isLoading.value = false
  }
}

// Refresh function for pull-to-refresh
async function refreshData() {
  await loadData()
}

// Helper to get rating delta for a player
function getRatingDelta(playerId: string): number | undefined {
  return ratingDeltaMap.value.get(playerId)
}

// Create a lookup map for membership type by playerId
const membershipMap = computed(() => {
  const map = new Map<string, 'PERMANENT' | 'SUB'>()
  groupPlayers.value.forEach(p => {
    map.set(p.playerId, p.membershipType)
  })
  return map
})

// Create lookup map for ratingDelta from groupPlayers
const ratingDeltaMap = computed(() => {
  const map = new Map<string, number | undefined>()
  groupPlayers.value.forEach(p => {
    map.set(p.playerId, p.ratingDelta)
  })
  return map
})

// Filter rankings based on membership type
const filteredRankings = computed(() => {
  if (filterType.value === 'all') {
    return rankings.value
  }
  // Filter to permanent players only using the membership lookup
  return rankings.value.filter(r => {
    const membership = membershipMap.value.get(r.playerId)
    return !membership || membership === 'PERMANENT'
  })
})

// Calculate previous ranks based on rating - delta
// This gives us what the rankings would have been before the last event
// We depend on filteredRankings so the previous rank is calculated RELATIVE to the current view
const previousRanksMap = computed(() => {
  const map = new Map<string, number>()
  
  // Build array of players with their previous ratings
  // Use filteredRankings to compare against the same set of players
  const playersWithPrevRating = filteredRankings.value.map(r => {
    const delta = ratingDeltaMap.value.get(r.playerId) || 0
    return {
      playerId: r.playerId,
      previousRating: r.rating - delta
    }
  })
  
  // Sort by previous rating (descending) to get previous ranks
  const sorted = [...playersWithPrevRating].sort((a, b) => b.previousRating - a.previousRating)
  
  // Assign previous ranks
  sorted.forEach((player, index) => {
    map.set(player.playerId, index + 1)
  })
  
  return map
})

// Get rank change for a player (positive = moved up, negative = moved down, 0 = no change)
function getRankChange(playerId: string, currentRank: number): number {
  const prevRank = previousRanksMap.value.get(playerId)
  if (prevRank === undefined) return 0
  return prevRank - currentRank // positive = moved up, negative = moved down
}

// Check if any player has a rating delta (meaning there was a recent event)
const hasRecentChanges = computed(() => {
  return groupPlayers.value.some(p => p.ratingDelta !== undefined && p.ratingDelta !== 0)
})

function getRankClass(rank: number): string {
  switch (rank) {
    case 1: return 'text-yellow-500' // Gold
    case 2: return 'text-slate-400'  // Silver
    case 3: return 'text-amber-700'  // Bronze
    default: return ''
  }
}

function isSub(playerId: string): boolean {
  return membershipMap.value.get(playerId) === 'SUB'
}

// Export as image functionality
async function exportAsImage() {
  if (!shareableRef.value) return
  
  isExporting.value = true
  try {
    const wrapper = shareableRef.value
    const rankingEl = wrapper.firstElementChild as HTMLElement
    
    const canvas = await html2canvas(rankingEl || wrapper, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
      width: (rankingEl || wrapper).scrollWidth,
      height: (rankingEl || wrapper).scrollHeight
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
    error.value = 'Failed to export image'
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div class="rankings-page container">
    <div class="page-header">
      <div class="header-left">
        <router-link :to="`/groups/${groupId}`" class="back-link">
          <ArrowLeft :size="16" /> Back to Group
        </router-link>
        <h1><Trophy :size="32" class="page-title-icon" /> Rankings</h1>
        <p class="subtitle">Current standings based on {{ group?.settings.ratingSystem === 'CATCH_UP' ? 'Catch-Up' : 'Serious ELO' }} ratings</p>
      </div>
      <div class="header-right">
        <BaseButton 
          v-if="!isLoading && filteredRankings.length > 0" 
          variant="secondary" 
          :loading="isExporting"
          @click="exportAsImage"
        >
          <Download :size="16" />
          Export Rankings
        </BaseButton>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-tabs" v-if="!isLoading && rankings.length > 0">
      <button 
        class="filter-tab" 
        :class="{ active: filterType === 'permanent' }"
        @click="filterType = 'permanent'"
      >
        Permanent
      </button>
      <button 
        class="filter-tab" 
        :class="{ active: filterType === 'all' }"
        @click="filterType = 'all'"
      >
        All Players
      </button>
    </div>

    <!-- Mobile: Skeleton Loader, Desktop: Spinner -->
    <SkeletonLoader v-if="isLoading" :rows="5" class="mobile-skeleton" />
    <LoadingSpinner v-if="isLoading" text="Loading rankings..." class="desktop-spinner" />

    <div v-else-if="error" class="error-message">{{ error }}</div>

    <EmptyState
      v-else-if="filteredRankings.length === 0"
      :icon="Trophy"
      title="No rankings yet"
      :description="filterType === 'permanent' ? 'No permanent players have rankings yet.' : 'Complete some events to see player rankings here.'"
    />

    <template v-else>
      <!-- Desktop Table View -->
      <BaseCard class="desktop-table-card">
        <table class="rankings-table">
          <thead>
            <tr>
              <th class="rank-col">Rank</th>
              <th class="player-col">Player</th>
              <th class="rating-col">Rating</th>
              <th class="games-col">Games</th>
              <th class="record-col">W/L/T</th>
              <th class="winrate-col">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, index) in filteredRankings" :key="entry.playerId" class="ranking-row">
              <td class="rank-col">
                <div class="rank-display">
                  <span class="rank-badge" :class="{ top3: index < 3 }">
                    <Medal v-if="index < 3" :class="getRankClass(index + 1)" :size="24" />
                    <span v-else>#{{ index + 1 }}</span>
                  </span>
                  <span v-if="getRankChange(entry.playerId, index + 1) > 0" class="rank-change up">
                    <ChevronUp :size="14" />{{ getRankChange(entry.playerId, index + 1) }}
                  </span>
                  <span v-else-if="getRankChange(entry.playerId, index + 1) < 0" class="rank-change down">
                    <ChevronDown :size="14" />{{ Math.abs(getRankChange(entry.playerId, index + 1)) }}
                  </span>
                  <span v-else-if="hasRecentChanges" class="rank-change same">
                    <Minus :size="12" />
                  </span>
                </div>
              </td>
              <td class="player-col">
                <div class="player-info">
                  <div class="player-avatar" :class="{ sub: isSub(entry.playerId) }">
                    {{ entry.displayName[0] }}
                  </div>
                  <span class="player-name">{{ entry.displayName }}</span>
                  <span v-if="isSub(entry.playerId)" class="sub-badge">Sub</span>
                </div>
              </td>
              <td class="rating-col">
                <div class="rating-display">
                  <span class="rating-value">{{ entry.rating.toFixed(1) }}</span>
                  <span v-if="getRatingDelta(entry.playerId) && getRatingDelta(entry.playerId)! > 0" class="rating-delta positive">
                    <TrendingUp :size="12" /> +{{ getRatingDelta(entry.playerId)!.toFixed(1) }}
                  </span>
                  <span v-else-if="getRatingDelta(entry.playerId) && getRatingDelta(entry.playerId)! < 0" class="rating-delta negative">
                    <TrendingDown :size="12" /> {{ getRatingDelta(entry.playerId)!.toFixed(1) }}
                  </span>
                </div>
              </td>
              <td class="games-col">{{ entry.gamesPlayed }}</td>
              <td class="record-col">
                <span class="wins">{{ entry.wins }}</span>/
                <span class="losses">{{ entry.losses }}</span>/
                <span class="ties">{{ entry.ties }}</span>
              </td>
              <td class="winrate-col">
                <div class="winrate-bar">
                  <div class="winrate-fill" :style="{ width: `${entry.winRate * 100}%` }"></div>
                </div>
                <span class="winrate-value">{{ (entry.winRate * 100).toFixed(0) }}%</span>
              </td>
            </tr>
          </tbody>
        </table>
      </BaseCard>

      <!-- Mobile Card View with Pull to Refresh -->
      <PullToRefresh :on-refresh="refreshData" class="mobile-rankings-wrapper">
        <div class="mobile-rankings">
        <div 
          v-for="(entry, index) in filteredRankings" 
          :key="entry.playerId" 
          class="mobile-rank-card"
        >
          <div class="mobile-rank-header">
            <div class="mobile-rank-left">
              <span class="mobile-rank-badge" :class="{ top3: index < 3 }">
                <Medal v-if="index < 3" :class="getRankClass(index + 1)" :size="24" />
                <span v-else>#{{ index + 1 }}</span>
              </span>
              <span v-if="getRankChange(entry.playerId, index + 1) > 0" class="rank-change up">
                <ChevronUp :size="12" />{{ getRankChange(entry.playerId, index + 1) }}
              </span>
              <span v-else-if="getRankChange(entry.playerId, index + 1) < 0" class="rank-change down">
                <ChevronDown :size="12" />{{ Math.abs(getRankChange(entry.playerId, index + 1)) }}
              </span>
              <span v-else-if="hasRecentChanges" class="rank-change same">
                <Minus :size="10" />
              </span>
            </div>
            <div class="mobile-player-info">
              <div class="player-avatar" :class="{ sub: isSub(entry.playerId) }">
                {{ entry.displayName[0] }}
              </div>
              <div class="mobile-player-details">
                <span class="player-name">{{ entry.displayName }}</span>
                <span v-if="isSub(entry.playerId)" class="sub-badge">Sub</span>
              </div>
            </div>
            <div class="mobile-rating">
              <span class="rating-value">{{ entry.rating.toFixed(1) }}</span>
              <span v-if="getRatingDelta(entry.playerId) && getRatingDelta(entry.playerId)! > 0" class="rating-delta positive">
                <TrendingUp :size="10" /> +{{ getRatingDelta(entry.playerId)!.toFixed(1) }}
              </span>
              <span v-else-if="getRatingDelta(entry.playerId) && getRatingDelta(entry.playerId)! < 0" class="rating-delta negative">
                <TrendingDown :size="10" /> {{ getRatingDelta(entry.playerId)!.toFixed(1) }}
              </span>
            </div>
          </div>
          <div class="mobile-rank-stats">
            <div class="mobile-stat">
              <span class="mobile-stat-label">Games</span>
              <span class="mobile-stat-value">{{ entry.gamesPlayed }}</span>
            </div>
            <div class="mobile-stat">
              <span class="mobile-stat-label">W/L/T</span>
              <span class="mobile-stat-value">
                <span class="wins">{{ entry.wins }}</span>/
                <span class="losses">{{ entry.losses }}</span>/
                <span class="ties">{{ entry.ties }}</span>
              </span>
            </div>
            <div class="mobile-stat">
              <span class="mobile-stat-label">Win Rate</span>
              <span class="mobile-stat-value winrate">{{ (entry.winRate * 100).toFixed(0) }}%</span>
            </div>
          </div>
        </div>
        </div>
      </PullToRefresh>
    </template>

    <!-- Hidden container for export (off-screen) -->
    <div class="export-hidden-container">
      <div ref="shareableRef">
        <ShareableRankings 
          v-if="group" 
          :rankings="filteredRankings" 
          :group-name="group.name"
          :rating-system="group.settings.ratingSystem"
        />
      </div>
    </div>

  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-lg);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 6px 12px;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
  transition: all var(--transition-fast);
  margin-bottom: var(--spacing-sm);
}

.back-link:hover {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

.page-header h1 {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 2rem;
  margin-bottom: var(--spacing-xs);
}

.subtitle {
  color: var(--color-text-secondary);
}

.text-yellow-500 { color: #eab308; }
.text-slate-400 { color: #94a3b8; }
.text-amber-700 { color: #b45309; }

/* Filter Tabs */
.filter-tabs {
  display: flex;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: 4px;
}

.filter-tab {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.filter-tab:hover {
  color: var(--color-text-primary);
}

.filter-tab.active {
  background: var(--color-primary);
  color: white;
}

.error-message {
  padding: var(--spacing-lg);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error);
  text-align: center;
}

/* Desktop Table */
.desktop-table-card {
  display: block;
}

.rankings-table {
  width: 100%;
  border-collapse: collapse;
}

.rankings-table th {
  text-align: left;
  padding: var(--spacing-md);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
}

.rankings-table td {
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
}

.rankings-table tr:last-child td {
  border-bottom: none;
}

.ranking-row:hover {
  background: var(--color-bg-hover);
}

.rank-col {
  width: 60px;
  text-align: center;
}

.rank-badge {
  font-weight: 600;
  color: var(--color-text-secondary);
}

.rank-badge.top3 {
  font-size: 1.25rem;
}

.player-col {
  min-width: 150px;
}

.player-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.player-avatar {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-full);
  font-weight: 600;
  font-size: 0.875rem;
  flex-shrink: 0;
}

.player-avatar.sub {
  background: #f59e0b;
}

.player-name {
  font-weight: 500;
}

.sub-badge {
  font-size: 0.625rem;
  padding: 2px 6px;
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
  border-radius: var(--radius-sm);
  font-weight: 600;
  text-transform: uppercase;
}

.rating-col {
  width: 100px;
}

/* Rank display with change indicator */
.rank-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.rank-change {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  font-size: 0.625rem;
  font-weight: 600;
  font-family: var(--font-mono);
}

.rank-change.up {
  color: var(--color-success);
}

.rank-change.down {
  color: var(--color-error);
}

.rank-change.same {
  color: var(--color-text-muted);
  opacity: 0.6;
}

/* Rating display with delta */
.rating-display {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.rating-delta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.6875rem;
  font-weight: 600;
  font-family: var(--font-mono);
}

.rating-delta.positive {
  color: var(--color-success);
}

.rating-delta.negative {
  color: var(--color-error);
}

.rating-value {
  font-size: 1.125rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--color-primary);
}

.games-col {
  width: 60px;
  text-align: center;
  color: var(--color-text-secondary);
}

.record-col {
  width: 100px;
  text-align: center;
  font-family: var(--font-mono);
  white-space: nowrap;
}

.wins { color: var(--color-success); }
.losses { color: var(--color-error); }
.ties { color: var(--color-warning); }

.winrate-col {
  width: 120px;
}

.winrate-bar {
  width: 60px;
  height: 6px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
  display: inline-block;
  vertical-align: middle;
  margin-right: var(--spacing-xs);
}

.winrate-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  transition: width var(--transition-normal);
}

.winrate-value {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

/* Mobile Card View */
.mobile-rankings {
  display: none;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.mobile-rank-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.mobile-rank-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.mobile-rank-badge {
  font-weight: 600;
  font-size: 1rem;
  min-width: 36px;
  text-align: center;
}

.mobile-rank-badge.top3 {
  font-size: 1.5rem;
}

.mobile-rank-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 40px;
}

.mobile-player-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
}

.mobile-player-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mobile-rating {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.mobile-rating .rating-value {
  font-size: 1.25rem;
}

.mobile-rating .rating-delta {
  font-size: 0.625rem;
}

.mobile-rank-stats {
  display: flex;
  justify-content: space-between;
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--color-border);
}

.mobile-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.mobile-stat-label {
  font-size: 0.625rem;
  text-transform: uppercase;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
}

.mobile-stat-value {
  font-weight: 500;
  font-size: 0.875rem;
}

.mobile-stat-value.winrate {
  color: var(--color-primary);
  font-weight: 700;
}

@media (max-width: 768px) {
  .page-header h1 {
    font-size: 1.5rem;
  }

  .desktop-table-card {
    display: none;
  }

  .mobile-rankings {
    display: flex;
  }
  
  .page-header {
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  
  .header-right {
    width: 100%;
    display: flex;
    justify-content: flex-end;
  }

  /* Show skeleton on mobile, hide spinner */
  .desktop-spinner {
    display: none !important;
  }
}

/* Hide skeleton on desktop by default */
.mobile-skeleton {
  display: none;
}

@media (max-width: 768px) {
  .mobile-skeleton {
    display: block;
  }
}

/* Hidden container for export - positioned off-screen but still renderable */
.export-hidden-container {
  position: fixed;
  left: -9999px;
  top: 0;
  pointer-events: none;
}


</style>








