<script setup lang="ts">
import { computed } from 'vue'
import type { RankingEntryDto } from '@/app/core/models/dto'
import { Trophy, Medal } from 'lucide-vue-next'

const props = defineProps<{
  rankings: RankingEntryDto[]
  groupName?: string
  ratingSystem?: string
}>()

const topRankings = computed(() => props.rankings.slice(0, 20)) // Show top 20 max for image to fit

function getRankClass(rank: number): string {
  switch (rank) {
    case 1: return 'text-yellow-500' // Gold
    case 2: return 'text-slate-400'  // Silver
    case 3: return 'text-amber-700'  // Bronze
    default: return ''
  }
}
</script>

<template>
  <div class="shareable-rankings">
    <!-- Header -->
    <div class="rankings-header">
      <div class="header-icon">
        <Trophy :size="48" class="trophy-icon" />
      </div>
      <div class="header-content">
        <h1 class="group-title">{{ groupName || 'Group Rankings' }}</h1>
        <div class="meta-badges">
          <span class="meta-badge">
            {{ ratingSystem === 'CATCH_UP' ? 'Catch-Up' : 'Serious ELO' }}
          </span>
          <span class="meta-text">{{ new Date().toLocaleDateString() }}</span>
        </div>
      </div>
    </div>

    <!-- Rankings Grid -->
    <div class="rankings-grid">
      <!-- Headers -->
      <div class="grid-header">
        <div class="col-rank">Rank</div>
        <div class="col-player">Player</div>
        <div class="col-rating">Rating</div>
        <div class="col-stats">Record</div>
        <div class="col-winrate">Win Rate</div>
      </div>

      <!-- Rows -->
      <div 
        v-for="(entry, index) in topRankings" 
        :key="entry.playerId" 
        class="ranking-row"
        :class="{ 'top-three': index < 3 }"
      >
        <div class="col-rank">
          <span class="rank-badge" :class="{ top3: index < 3 }">
            <Medal v-if="index < 3" :class="getRankClass(index + 1)" :size="20" />
            <span v-else>#{{ index + 1 }}</span>
          </span>
        </div>
        <div class="col-player">
          <div class="player-name">{{ entry.displayName }}</div>
        </div>
        <div class="col-rating">
          <span class="rating-value">{{ entry.rating.toFixed(1) }}</span>
        </div>
        <div class="col-stats">
          <span class="wins">{{ entry.wins }}W</span>
          <span class="separator">-</span>
          <span class="losses">{{ entry.losses }}L</span>
        </div>
        <div class="col-winrate">
          <div class="winrate-bar-bg">
            <div class="winrate-bar-fill" :style="{ width: `${entry.winRate * 100}%` }"></div>
          </div>
          <span class="winrate-text">{{ (entry.winRate * 100).toFixed(0) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shareable-rankings {
  /* Fixed dimensions for consistent export */
  width: 800px;
  min-height: 600px; /* Allow growth but start reasonable */
  padding: 40px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: #ffffff;
  border-radius: 16px;
  position: relative;
  overflow: hidden;
}

/* Background accents */
.shareable-rankings::before {
  content: '';
  position: absolute;
  top: -100px;
  right: -100px;
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%);
  border-radius: 50%;
  pointer-events: none;
}

.shareable-rankings::after {
  content: '';
  position: absolute;
  bottom: -100px;
  left: -100px;
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 70%);
  border-radius: 50%;
  pointer-events: none;
}

.rankings-header {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
}

.header-icon {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f59e0b 0%, #b45309 100%);
  border-radius: 20px;
  box-shadow: 0 10px 25px -5px rgba(245, 158, 11, 0.3);
}

.trophy-icon {
  color: white;
}

.header-content {
  flex: 1;
}

.group-title {
  font-size: 2.5rem;
  font-weight: 800;
  margin: 0 0 8px 0;
  color: #ffffff;
  letter-spacing: -0.02em;
}

.meta-badges {
  display: flex;
  align-items: center;
  gap: 16px;
}

.meta-badge {
  background: rgba(255, 255, 255, 0.1);
  padding: 4px 12px;
  border-radius: 100px;
  font-size: 0.875rem;
  font-weight: 600;
  color: #10b981;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.meta-text {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.9rem;
}

/* Grid */
.rankings-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.grid-header {
  display: grid;
  grid-template-columns: 60px 2fr 100px 120px 140px;
  padding: 0 16px 12px 16px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 700;
}

.col-rank { text-align: center; }
.col-player { text-align: left; padding-left: 12px; }
.col-rating { text-align: right; font-family: 'Consolas', monospace; }
.col-stats { text-align: right; }
.col-winrate { text-align: right; padding-right: 8px; }

.ranking-row {
  display: grid;
  grid-template-columns: 60px 2fr 100px 120px 140px;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.ranking-row.top-three {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.03) 100%);
  border-color: rgba(255, 255, 255, 0.1);
}

.rank-badge {
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.5);
}

.text-yellow-500 { color: #fcd34d; filter: drop-shadow(0 0 8px rgba(252, 211, 77, 0.3)); }
.text-slate-400 { color: #e2e8f0; filter: drop-shadow(0 0 8px rgba(226, 232, 240, 0.3)); }
.text-amber-700 { color: #f59e0b; filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.3)); }

.player-name {
  font-weight: 600;
  font-size: 1.1rem;
  padding-left: 12px;
}

.rating-value {
  font-family: 'Consolas', monospace;
  font-size: 1.25rem;
  font-weight: 700;
  color: #10b981;
}

.col-stats {
  font-family: 'Consolas', monospace;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.95rem;
}

.wins { color: #34d399; }
.losses { color: #f87171; }
.separator { color: rgba(255, 255, 255, 0.3); margin: 0 4px; }

.winrate-bar-bg {
  width: 80px;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  display: inline-block;
  margin-right: 12px;
  vertical-align: middle;
}

.winrate-bar-fill {
  height: 100%;
  background: #06b6d4;
  border-radius: 10px;
}

.winrate-text {
  font-family: 'Consolas', monospace;
  font-size: 0.95rem;
  font-weight: 600;
  color: #06b6d4;
}

.footer {
  margin-top: 32px;
  text-align: center;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
</style>
