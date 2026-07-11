<script setup lang="ts">
import { computed } from 'vue'
import type { RankingEntryDto } from '@/app/core/models/dto'
import { Trophy, Medal } from 'lucide-vue-next'

// NOTE: This component is rendered off-screen and exported via html2canvas,
// which cannot parse oklch()/color-mix(). It intentionally keeps a scoped
// CSS block with hex-only colors and NO Tailwind utilities.
const props = defineProps<{
  rankings: RankingEntryDto[]
  groupName?: string
  ratingSystem?: string
}>()

const topRankings = computed(() => props.rankings.slice(0, 20)) // Show top 20 max for image to fit

const ratingSystemLabel = computed(() => {
  switch (props.ratingSystem) {
    case 'CATCH_UP': return 'Catch-Up'
    case 'RACS_ELO': return "Rac's ELO"
    default: return 'Serious ELO'
  }
})

function getRankClass(rank: number): string {
  switch (rank) {
    case 1: return 'medal-gold'
    case 2: return 'medal-silver'
    case 3: return 'medal-bronze'
    default: return ''
  }
}
</script>

<template>
  <div class="shareable-rankings">
    <!-- Header -->
    <div class="rankings-header">
      <div class="header-icon">
        <Trophy :size="56" class="trophy-icon" />
      </div>
      <div class="header-content">
        <h1 class="group-title">{{ groupName || 'Group Rankings' }}</h1>
        <div class="meta-badges">
          <span class="meta-badge">{{ ratingSystemLabel }}</span>
          <span class="meta-text">{{ new Date().toLocaleDateString() }}</span>
        </div>
      </div>
    </div>

    <!-- Rankings Grid -->
    <div class="rankings-grid">
      <div class="grid-header">
        <div class="col-rank">Rank</div>
        <div class="col-player">Player</div>
        <div class="col-rating">Rating</div>
        <div class="col-stats">Record</div>
        <div class="col-winrate">Win Rate</div>
      </div>

      <div
        v-for="(entry, index) in topRankings"
        :key="entry.playerId"
        class="ranking-row"
        :class="{ 'top-three': index < 3 }"
      >
        <div class="col-rank">
          <span class="rank-badge">
            <Medal v-if="index < 3" :class="getRankClass(index + 1)" :size="22" />
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
/* Hex-only colors: html2canvas cannot parse oklch(). No Tailwind utilities. */
.shareable-rankings {
  width: 1080px;
  min-height: 600px;
  padding: 56px;
  background: #0f172a;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: #f8fafc;
  border-radius: 20px;
  position: relative;
  overflow: hidden;
}

.rankings-header {
  display: flex;
  align-items: center;
  gap: 28px;
  margin-bottom: 40px;
  padding-bottom: 28px;
  border-bottom: 2px solid #1e293b;
}

.header-icon {
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #10b981;
  border-radius: 24px;
  flex-shrink: 0;
}

.trophy-icon {
  color: #0f172a;
}

.header-content {
  flex: 1;
  min-width: 0;
}

.group-title {
  font-size: 3rem;
  font-weight: 800;
  margin: 0 0 10px 0;
  color: #f8fafc;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.meta-badges {
  display: flex;
  align-items: center;
  gap: 16px;
}

.meta-badge {
  background: #1e293b;
  padding: 6px 16px;
  border-radius: 100px;
  font-size: 1rem;
  font-weight: 600;
  color: #10b981;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.meta-text {
  color: #94a3b8;
  font-size: 1rem;
}

/* Grid */
.rankings-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.grid-header {
  display: grid;
  grid-template-columns: 80px 2fr 140px 160px 200px;
  padding: 0 20px 12px 20px;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #94a3b8;
  font-weight: 700;
}

.col-rank { text-align: center; }
.col-player { text-align: left; padding-left: 12px; }
.col-rating { text-align: right; }
.col-stats { text-align: right; }
.col-winrate { text-align: right; padding-right: 8px; }

.ranking-row {
  display: grid;
  grid-template-columns: 80px 2fr 140px 160px 200px;
  align-items: center;
  background: #1e293b;
  padding: 16px 20px;
  border-radius: 14px;
  border: 1px solid #334155;
}

.ranking-row.top-three {
  border-color: #475569;
}

.rank-badge {
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: 700;
  color: #94a3b8;
  font-family: 'Consolas', monospace;
}

.medal-gold { color: #facc15; }
.medal-silver { color: #cbd5e1; }
.medal-bronze { color: #d97706; }

.player-name {
  font-weight: 600;
  font-size: 1.35rem;
  padding-left: 12px;
  color: #f8fafc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rating-value {
  font-family: 'Consolas', monospace;
  font-size: 1.5rem;
  font-weight: 700;
  color: #10b981;
}

.col-stats {
  font-family: 'Consolas', monospace;
  color: #f8fafc;
  font-size: 1.1rem;
}

.wins { color: #34d399; }
.losses { color: #f87171; }
.separator { color: #94a3b8; margin: 0 4px; }

.winrate-bar-bg {
  width: 110px;
  height: 8px;
  background: #334155;
  border-radius: 10px;
  display: inline-block;
  margin-right: 14px;
  vertical-align: middle;
}

.winrate-bar-fill {
  height: 100%;
  background: #10b981;
  border-radius: 10px;
}

.winrate-text {
  font-family: 'Consolas', monospace;
  font-size: 1.1rem;
  font-weight: 600;
  color: #f8fafc;
}
</style>
