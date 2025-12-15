<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { rankingsApi } from '../services/rankings.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import type { RankingEntryDto, GroupDto, GroupPlayerDto } from '@/app/core/models/dto'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import EmptyState from '@/app/core/ui/components/EmptyState.vue'

const route = useRoute()
const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const rankings = ref<RankingEntryDto[]>([])
const groupPlayers = ref<GroupPlayerDto[]>([])
const isLoading = ref(true)
const error = ref('')

// Filter state: 'permanent' or 'all'
const filterType = ref<'permanent' | 'all'>('permanent')

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

// Create a lookup map for membership type by playerId
const membershipMap = computed(() => {
  const map = new Map<string, 'PERMANENT' | 'SUB'>()
  groupPlayers.value.forEach(p => {
    map.set(p.playerId, p.membershipType)
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

function getRankBadge(rank: number): string {
  switch (rank) {
    case 1: return '🥇'
    case 2: return '🥈'
    case 3: return '🥉'
    default: return `#${rank}`
  }
}

function isSub(playerId: string): boolean {
  return membershipMap.value.get(playerId) === 'SUB'
}
</script>

<template>
  <div class="rankings-page container">
    <div class="page-header">
      <div>
        <router-link :to="`/groups/${groupId}`" class="back-link">
          ← Back to {{ group?.name || 'Group' }}
        </router-link>
        <h1>🏆 Rankings</h1>
        <p class="subtitle">Current standings based on {{ group?.settings.ratingSystem === 'CATCH_UP' ? 'Catch-Up' : 'Serious ELO' }} ratings</p>
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

    <LoadingSpinner v-if="isLoading" text="Loading rankings..." />

    <div v-else-if="error" class="error-message">{{ error }}</div>

    <EmptyState
      v-else-if="filteredRankings.length === 0"
      icon="🏆"
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
                <span class="rank-badge" :class="{ top3: index < 3 }">
                  {{ getRankBadge(index + 1) }}
                </span>
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
                <span class="rating-value">{{ entry.rating.toFixed(1) }}</span>
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

      <!-- Mobile Card View -->
      <div class="mobile-rankings">
        <div 
          v-for="(entry, index) in filteredRankings" 
          :key="entry.playerId" 
          class="mobile-rank-card"
        >
          <div class="mobile-rank-header">
            <span class="mobile-rank-badge" :class="{ top3: index < 3 }">
              {{ getRankBadge(index + 1) }}
            </span>
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
    </template>
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: var(--spacing-lg);
}

.back-link {
  display: inline-block;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  margin-bottom: var(--spacing-sm);
}

.page-header h1 {
  font-size: 2rem;
  margin-bottom: var(--spacing-xs);
}

.subtitle {
  color: var(--color-text-secondary);
}

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
  width: 80px;
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
  text-align: right;
}

.mobile-rating .rating-value {
  font-size: 1.25rem;
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
}
</style>





