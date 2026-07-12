<script setup lang="ts">
import { computed } from 'vue'
import type { RankingEntryDto } from '@/app/core/models/dto'
import { BRAND, FONTS } from '@/app/core/brand/brand-constants'

// NOTE: This component is rendered off-screen and exported via html2canvas,
// which cannot parse oklch()/color-mix(). It keeps a scoped CSS block fed by
// plain-hex CSS custom properties from brand-constants (the pattern proven by
// ShareableSchedule.vue) and uses NO Tailwind utilities.
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

const rootStyle = computed(() => ({
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
  '--sh-win': BRAND.dark.win,
  '--sh-loss': BRAND.dark.loss,
  '--sh-font-display': FONTS.display,
  '--sh-font-sans': FONTS.sans,
  '--sh-font-mono': FONTS.mono
}))
</script>

<template>
  <div class="shareable-rankings" :style="rootStyle">
    <!-- Header -->
    <div class="rankings-header">
      <div class="header-eyebrow">The Ladder</div>
      <h1 class="group-title">{{ groupName || 'Group Rankings' }}</h1>
      <div class="meta-row">
        <span class="meta-tape">{{ ratingSystemLabel }}</span>
        <span class="meta-text">{{ new Date().toLocaleDateString() }}</span>
      </div>
      <!-- Kitchen line: 2px volt rule over a hairline -->
      <div class="kitchen-rule">
        <div class="kitchen-rule-volt"></div>
        <div class="kitchen-rule-hair"></div>
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
          <span class="rank-value" :class="{ 'rank-volt': index < 3 }">{{ index + 1 }}</span>
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

    <div class="rankings-footer">PickleRank · Courtside</div>
  </div>
</template>

<!--
  EXCEPTION: this component keeps a scoped style block with hex colors only
  (fed through plain-hex CSS custom properties from brand-constants.ts).
  It is rendered off-screen and rasterized by html2canvas, which cannot parse
  the oklch()/color-mix() values Tailwind v4 utilities produce.
-->
<style scoped>
.shareable-rankings {
  width: 1080px;
  min-height: 600px;
  padding: 48px 56px;
  background: var(--sh-page);
  font-family: var(--sh-font-sans);
  color: var(--sh-ink);
  border-radius: 20px;
  border: 1px solid var(--sh-line-strong);
  position: relative;
  overflow: hidden;
}

.rankings-header {
  margin-bottom: 32px;
}

.header-eyebrow {
  font-family: var(--sh-font-display);
  font-variation-settings: "wdth" 115;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--sh-ink-faint);
  margin-bottom: 10px;
}

.group-title {
  font-family: var(--sh-font-display);
  font-variation-settings: "wdth" 118;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 2.8rem;
  line-height: 1.1;
  margin: 0 0 12px 0;
  color: var(--sh-ink);
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.meta-tape {
  display: inline-block;
  background: var(--sh-volt);
  color: var(--sh-volt-contrast);
  padding: 4px 14px;
  border-radius: 4px;
  transform: skewX(-6deg);
  font-family: var(--sh-font-display);
  font-variation-settings: "wdth" 115;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.meta-text {
  color: var(--sh-ink-muted);
  font-family: var(--sh-font-mono);
  font-size: 0.95rem;
}

.kitchen-rule {
  margin-top: 22px;
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

/* Grid */
.rankings-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.grid-header {
  display: grid;
  grid-template-columns: 80px 2fr 140px 160px 200px;
  padding: 0 20px 10px 20px;
  font-family: var(--sh-font-display);
  font-variation-settings: "wdth" 115;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--sh-ink-faint);
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
  background: var(--sh-surface-1);
  padding: 14px 20px;
  border-radius: 14px;
  border: 1px solid var(--sh-line);
}

.ranking-row.top-three {
  border-color: var(--sh-line-strong);
  border-left: 3px solid var(--sh-volt);
}

.rank-value {
  font-family: var(--sh-font-display);
  font-variation-settings: "wdth" 68;
  font-weight: 850;
  font-variant-numeric: tabular-nums lining-nums;
  font-size: 1.5rem;
  color: var(--sh-ink-muted);
}

.rank-volt {
  color: var(--sh-volt);
}

.player-name {
  font-weight: 600;
  font-size: 1.35rem;
  padding-left: 12px;
  color: var(--sh-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rating-value {
  font-family: var(--sh-font-display);
  font-variation-settings: "wdth" 68;
  font-weight: 850;
  font-variant-numeric: tabular-nums lining-nums;
  font-size: 1.6rem;
  color: var(--sh-volt);
}

.col-stats {
  font-family: var(--sh-font-mono);
  color: var(--sh-ink);
  font-size: 1.05rem;
}

.wins { color: var(--sh-win); }
.losses { color: var(--sh-loss); }
.separator { color: var(--sh-ink-faint); margin: 0 4px; }

.winrate-bar-bg {
  width: 110px;
  height: 8px;
  background: var(--sh-surface-2);
  border-radius: 10px;
  display: inline-block;
  margin-right: 14px;
  vertical-align: middle;
}

.winrate-bar-fill {
  height: 100%;
  background: var(--sh-volt);
  border-radius: 10px;
}

.winrate-text {
  font-family: var(--sh-font-mono);
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--sh-ink);
}

.rankings-footer {
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
