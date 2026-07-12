<script setup lang="ts">
import { computed } from 'vue'
import type { EventDto, GameDto } from '@/app/core/models/dto'
import { BRAND, FONTS } from '@/app/core/brand/brand-constants'

const props = defineProps<{
  event: EventDto
  gamesByRound: GameDto[][]
}>()

// Dynamic grid columns + the COURTSIDE dark palette as plain-hex CSS vars.
// html2canvas resolves var() indirection to the computed hex values; only
// oklch()/color-mix() functions are off-limits, so this stays rasterizable.
const rootStyle = computed(() => ({
  '--courts': props.event.courts,
  '--sh-page': BRAND.dark.surfacePage,
  '--sh-surface-1': BRAND.dark.surface1,
  '--sh-surface-2': BRAND.dark.surface2,
  '--sh-ink': BRAND.dark.ink,
  '--sh-ink-muted': BRAND.dark.inkMuted,
  '--sh-ink-faint': BRAND.dark.inkFaint,
  '--sh-line': BRAND.dark.line,
  '--sh-line-strong': BRAND.dark.lineStrong,
  '--sh-volt': BRAND.dark.accentFill,
  '--sh-volt-contrast': BRAND.dark.accentContrast,
  '--sh-font-display': FONTS.display,
  '--sh-font-sans': FONTS.sans,
  '--sh-font-mono': FONTS.mono
}))
</script>

<template>
  <div class="shareable-schedule" :style="rootStyle">
    <!-- Header -->
    <div class="schedule-header">
      <div class="event-eyebrow">Match schedule</div>
      <h1 class="event-title">{{ event.name || 'Game Schedule' }}</h1>
      <div class="event-meta">
        <span>{{ event.rounds }} Rounds</span>
        <span class="meta-dot">•</span>
        <span>{{ event.courts }} Courts</span>
      </div>
      <!-- Kitchen line: 2px volt rule over a hairline -->
      <div class="kitchen-rule">
        <div class="kitchen-rule-volt"></div>
        <div class="kitchen-rule-hair"></div>
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
          R{{ roundIdx + 1 }}
        </div>
        <div
          v-for="game in roundGames"
          :key="game.id"
          class="game-cell"
        >
          <div class="team team1">
            <span class="players">{{ game.team1.map(p => p.displayName).join(' & ') }}</span>
            <span class="elo">{{ Math.round(game.team1Elo || 0) }}</span>
          </div>
          <div class="vs">vs</div>
          <div class="team team2">
            <span class="players">{{ game.team2.map(p => p.displayName).join(' & ') }}</span>
            <span class="elo">{{ Math.round(game.team2Elo || 0) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="schedule-footer">PickleRank · Courtside</div>
  </div>
</template>

<!--
  EXCEPTION: this component keeps a scoped style block with hex colors only
  (fed through plain-hex CSS custom properties from brand-constants.ts).
  It is rendered off-screen and rasterized by html2canvas, which cannot parse
  the oklch()/color-mix() values Tailwind v4 utilities produce.
-->
<style scoped>
.shareable-schedule {
  /* Fixed width for a consistent exported image */
  width: 1080px;
  min-height: 600px;
  padding: 48px;
  background: var(--sh-page);
  font-family: var(--sh-font-sans);
  color: var(--sh-ink);
  border-radius: 20px;
  border: 1px solid var(--sh-line-strong);
}

.schedule-header {
  text-align: center;
  margin-bottom: 28px;
}

.event-eyebrow {
  font-family: var(--sh-font-display);
  font-variation-settings: "wdth" 115;
  font-weight: 700;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--sh-ink-faint);
  margin-bottom: 10px;
}

.event-title {
  font-family: var(--sh-font-display);
  font-variation-settings: "wdth" 118;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 2.6rem;
  line-height: 1.1;
  margin: 0 0 10px 0;
  color: var(--sh-ink);
}

.event-meta {
  display: flex;
  justify-content: center;
  gap: 12px;
  font-family: var(--sh-font-mono);
  font-size: 0.95rem;
  color: var(--sh-ink-muted);
}

.meta-dot {
  color: var(--sh-volt);
}

.kitchen-rule {
  margin-top: 20px;
}

.kitchen-rule-volt {
  height: 2px;
  background: var(--sh-volt);
}

.kitchen-rule-hair {
  height: 1px;
  margin-top: 7px;
  background: var(--sh-line-strong);
}

.schedule-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grid-header {
  display: grid;
  grid-template-columns: 84px repeat(var(--courts, 2), 1fr);
  gap: 12px;
}

.round-header {
  /* Empty cell for alignment */
}

.court-header {
  text-align: center;
  font-family: var(--sh-font-display);
  font-variation-settings: "wdth" 115;
  font-weight: 700;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--sh-ink-muted);
  padding: 10px 8px;
  background: var(--sh-surface-2);
  border-radius: 6px;
  transform: skewX(-6deg);
}

.round-row {
  display: grid;
  grid-template-columns: 84px repeat(var(--courts, 2), 1fr);
  gap: 12px;
}

.round-label {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--sh-font-display);
  font-variation-settings: "wdth" 68;
  font-weight: 850;
  font-size: 1.5rem;
  color: var(--sh-volt-contrast);
  background: var(--sh-volt);
  border-radius: 6px;
  padding: 8px;
  transform: skewX(-6deg);
}

.game-cell {
  background: var(--sh-surface-1);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--sh-line-strong);
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
  color: var(--sh-ink);
}

.elo {
  font-size: 0.8rem;
  color: var(--sh-ink-faint);
  font-family: var(--sh-font-mono);
}

.vs {
  text-align: center;
  font-family: var(--sh-font-display);
  font-variation-settings: "wdth" 115;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--sh-volt);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.schedule-footer {
  margin-top: 28px;
  text-align: center;
  font-family: var(--sh-font-display);
  font-variation-settings: "wdth" 115;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sh-ink-faint);
}
</style>
