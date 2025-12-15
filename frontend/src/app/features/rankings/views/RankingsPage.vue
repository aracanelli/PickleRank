<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { rankingsApi } from '../services/rankings.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import type { RankingEntryDto, GroupDto } from '@/app/core/models/dto'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import EmptyState from '@/app/core/ui/components/EmptyState.vue'

const route = useRoute()
const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const rankings = ref<RankingEntryDto[]>([])
const isLoading = ref(true)
const error = ref('')

onMounted(async () => {
  await Promise.all([loadGroup(), loadRankings()])
})

async function loadGroup() {
  try {
    group.value = await groupsApi.get(groupId.value)
  } catch (e: any) {
    error.value = e.message
  }
}

async function loadRankings() {
  isLoading.value = true
  try {
    const response = await rankingsApi.getRankings(groupId.value)
    rankings.value = response.rankings
  } catch (e: any) {
    error.value = e.message || 'Failed to load rankings'
  } finally {
    isLoading.value = false
  }
}

function getRankBadge(rank: number): string {
  switch (rank) {
    case 1: return '🥇'
    case 2: return '🥈'
    case 3: return '🥉'
    default: return `#${rank}`
  }
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

    <LoadingSpinner v-if="isLoading" text="Loading rankings..." />

    <div v-else-if="error" class="error-message">{{ error }}</div>

    <EmptyState
      v-else-if="rankings.length === 0"
      icon="🏆"
      title="No rankings yet"
      description="Complete some events to see player rankings here."
    />

    <BaseCard v-else>
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
          <tr v-for="entry in rankings" :key="entry.playerId" class="ranking-row">
            <td class="rank-col">
              <span class="rank-badge" :class="{ top3: entry.rank <= 3 }">
                {{ getRankBadge(entry.rank) }}
              </span>
            </td>
            <td class="player-col">
              <div class="player-info">
                <div class="player-avatar">{{ entry.displayName[0] }}</div>
                <span class="player-name">{{ entry.displayName }}</span>
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
              <span class="winrate-value">{{ (entry.winRate * 100).toFixed(1) }}%</span>
            </td>
          </tr>
        </tbody>
      </table>
    </BaseCard>
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: var(--spacing-xl);
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

.error-message {
  padding: var(--spacing-lg);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error);
  text-align: center;
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
  width: 80px;
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
  min-width: 200px;
}

.player-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.player-avatar {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-full);
  font-weight: 600;
  font-size: 0.875rem;
}

.player-name {
  font-weight: 500;
}

.rating-col {
  width: 100px;
}

.rating-value {
  font-size: 1.125rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--color-primary);
}

.games-col {
  width: 80px;
  text-align: center;
  color: var(--color-text-secondary);
}

.record-col {
  width: 120px;
  text-align: center;
  font-family: var(--font-mono);
}

.wins { color: var(--color-success); }
.losses { color: var(--color-error); }
.ties { color: var(--color-warning); }

.winrate-col {
  width: 150px;
}

.winrate-bar {
  width: 80px;
  height: 6px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
  display: inline-block;
  vertical-align: middle;
  margin-right: var(--spacing-sm);
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

@media (max-width: 768px) {
  .rankings-table {
    display: block;
    overflow-x: auto;
  }

  .games-col,
  .record-col {
    display: none;
  }
}
</style>




