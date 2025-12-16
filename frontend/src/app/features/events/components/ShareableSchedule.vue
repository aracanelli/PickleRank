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
  </div>
</template>

<style scoped>
.shareable-schedule {
  /* Fixed landscape dimensions for export */
  width: 1200px;
  min-height: 600px;
  padding: 32px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: #ffffff;
  border-radius: 16px;
}

.schedule-header {
  text-align: center;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
}

.event-title {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 8px 0;
  background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.event-meta {
  display: flex;
  justify-content: center;
  gap: 12px;
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.7);
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
  color: rgba(255, 255, 255, 0.6);
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
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
  background: rgba(16, 185, 129, 0.1);
  border-radius: 8px;
  padding: 8px;
}

.game-cell {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.team {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.players {
  font-weight: 500;
  font-size: 0.95rem;
}

.elo {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
  font-family: 'Consolas', 'Monaco', monospace;
}

.vs {
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
}
</style>
