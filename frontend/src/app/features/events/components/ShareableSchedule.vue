<script setup lang="ts">
import { computed } from 'vue'
import type { EventDto, GameDto } from '@/app/core/models/dto'

const props = defineProps<{
  event: EventDto
  gamesByRound: GameDto[][]
}>()

// Dynamic grid columns style based on court count
const gridStyle = computed(() => ({
  '--courts': props.event.courts
}))
</script>

<template>
  <div class="shareable-schedule" :style="gridStyle">
    <!-- Header -->
    <div class="schedule-header">
      <h1 class="event-title">{{ event.name || 'Game Schedule' }}</h1>
      <div class="event-meta">
        <span>{{ event.rounds }} Rounds</span>
        <span>•</span>
        <span>{{ event.courts }} Courts</span>
      </div>
    </div>

    <!-- Schedule Grid -->
    <div class="schedule-grid">
      <!-- Header Row -->
      <div class="grid-header">
        <div class="round-header"></div>
        <div
          v-for="courtNum in event.courts"
          :key="courtNum"
          class="court-header"
        >
          Court {{ courtNum }}
        </div>
      </div>

      <!-- Round Rows -->
      <div
        v-for="(roundGames, roundIdx) in gamesByRound"
        :key="roundIdx"
        class="round-row"
      >
        <div class="round-label">
          Round {{ roundIdx + 1 }}
        </div>
        <div
          v-for="game in roundGames"
          :key="game.id"
          class="game-cell"
        >
          <div class="team team1">
            <span class="players">{{ game.team1.map(p => p.displayName).join(' & ') }}</span>
            <span class="elo">({{ Math.round(game.team1Elo || 0) }})</span>
          </div>
          <div class="vs">vs</div>
          <div class="team team2">
            <span class="players">{{ game.team2.map(p => p.displayName).join(' & ') }}</span>
            <span class="elo">({{ Math.round(game.team2Elo || 0) }})</span>
          </div>
        </div>
      </div>
    </div>

    <div class="schedule-footer">PickleRank</div>
  </div>
</template>

<!--
  EXCEPTION: this component keeps a scoped style block with hex colors only.
  It is rendered off-screen and rasterized by html2canvas, which cannot parse
  the oklch()/color-mix() values Tailwind v4 utilities produce.
-->
<style scoped>
.shareable-schedule {
  /* Fixed width for a consistent exported image */
  width: 1080px;
  min-height: 600px;
  padding: 40px;
  background: #0f172a;
  font-family: 'Outfit', 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: #f8fafc;
  border-radius: 16px;
}

.schedule-header {
  text-align: center;
  margin-bottom: 28px;
  padding-bottom: 20px;
  border-bottom: 2px solid #1e293b;
}

.event-title {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 8px 0;
  color: #10b981;
}

.event-meta {
  display: flex;
  justify-content: center;
  gap: 12px;
  font-size: 1rem;
  color: #94a3b8;
}

.schedule-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grid-header {
  display: grid;
  grid-template-columns: 100px repeat(var(--courts, 2), 1fr);
  gap: 12px;
}

.round-header {
  /* Empty cell for alignment */
}

.court-header {
  text-align: center;
  font-weight: 600;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  padding: 10px 8px;
  background: #1e293b;
  border-radius: 10px;
}

.round-row {
  display: grid;
  grid-template-columns: 100px repeat(var(--courts, 2), 1fr);
  gap: 12px;
}

.round-label {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
  color: #10b981;
  background: #1e293b;
  border: 1px solid #10b981;
  border-radius: 10px;
  padding: 8px;
}

.game-cell {
  background: #1e293b;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid #334155;
}

.team {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.players {
  font-weight: 600;
  font-size: 0.95rem;
  color: #f8fafc;
}

.elo {
  font-size: 0.8rem;
  color: #94a3b8;
  font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
}

.vs {
  text-align: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.schedule-footer {
  margin-top: 24px;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
</style>
