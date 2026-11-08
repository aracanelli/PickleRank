<script setup lang="ts">
/**
 * Top three as a court-side stand: 2nd on the left, 1st in the middle and tallest, 3rd on the right.
 * DOM order stays 1, 2, 3 so screen readers hear the ranking in order; CSS places the steps.
 */
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { Crown } from 'lucide-vue-next'
import PlayerAvatar from './PlayerAvatar.vue'

export interface PodiumEntry {
  /** global player id, used for the jersey colour and as the key */
  playerId: string
  name: string
  rating: number
  wins: number
  losses: number
  ties: number
  to?: RouteLocationRaw
  isMe?: boolean
}

defineProps<{ entries: PodiumEntry[] }>()

const place = ['1st', '2nd', '3rd']
const medal = (i: number) => (i + 1) as 1 | 2 | 3
</script>

<template>
  <ol role="list" class="podium" aria-label="Top three">
    <li v-for="(e, i) in entries.slice(0, 3)" :key="e.playerId" class="step" :class="`step--${i + 1}`">
      <component :is="e.to ? RouterLink : 'div'" :to="e.to" class="step__link">
        <span class="step__who">
          <span class="step__face">
            <PlayerAvatar :name="e.name" size="lg" :medal="medal(i)" />
            <span v-if="i === 0" class="step__crown" aria-hidden="true"><Crown :size="16" :stroke-width="2.5" /></span>
          </span>
          <span class="visually-hidden">{{ place[i] }}: </span>
          <span class="step__name truncate">{{ e.name }}<span v-if="e.isMe" class="step__you"> (you)</span></span>
          <span class="step__rating num"><span class="visually-hidden">, rating </span>{{ Math.round(e.rating) }}</span>
          <span class="step__rec muted"><span class="visually-hidden">, record </span>{{ e.wins }}–{{ e.losses }}<template v-if="e.ties">–{{ e.ties }}</template></span>
        </span>
        <span class="step__block" aria-hidden="true">
          <span class="step__place num">{{ i + 1 }}</span>
        </span>
      </component>
    </li>
  </ol>
</template>

<style scoped>
.podium {
  list-style: none;
  margin: var(--s3) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: var(--s2);
  /* the stand sits on a court line */
  border-bottom: 3px solid var(--net);
}
.step--1 { grid-column: 2; grid-row: 1; }
.step--2 { grid-column: 1; grid-row: 1; }
.step--3 { grid-column: 3; grid-row: 1; }

.step__link {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  color: var(--ink);
  text-decoration: none;
  border-radius: var(--r-tile) var(--r-tile) 0 0;
}
.step__link:hover .step__name { text-decoration: underline; }
.step__who {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  padding: 0 2px var(--s2);
  text-align: center;
}
.step__face { position: relative; margin: 8px 0 var(--s2); }
.step__crown {
  position: absolute;
  top: -10px;
  right: -12px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--optic);
  color: var(--on-optic);
  box-shadow: 0 0 0 3px var(--bg);
}
.step__name { max-width: 100%; font-weight: 700; font-size: var(--text-sm); }
.step__you { font-weight: 400; color: var(--ink-2); }
.step__rating { font-size: var(--text-xl); line-height: 1.1; }
.step--1 .step__rating { font-size: 2.25rem; }
.step__rec { font-size: var(--text-sm); font-variant-numeric: tabular-nums; }

.step__block {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: var(--s2);
  border-radius: var(--r-control) var(--r-control) 0 0;
}
.step--1 .step__block { height: 76px; background: var(--medal-1); }
.step--2 .step__block { height: 52px; background: var(--medal-2); }
.step--3 .step__block { height: 36px; background: var(--medal-3); padding-top: 4px; }
/* place numbers sit on a surface chip: medal colours are fills, never text backgrounds */
.step__place {
  display: grid;
  place-items: center;
  min-width: 28px;
  height: 28px;
  padding: 0 4px;
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink);
  font-weight: 700;
  font-size: var(--text-lg);
  line-height: 1;
}

@media (prefers-reduced-motion: no-preference) {
  .step__block { animation: rise 420ms var(--ease) both; transform-origin: bottom; }
  .step--1 .step__block { animation-delay: 120ms; }
  .step--3 .step__block { animation-delay: 60ms; }
}
@keyframes rise { from { transform: scaleY(0.4); } }
</style>
