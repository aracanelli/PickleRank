<script setup lang="ts">
/**
 * Top three as a court-side stand: 2nd on the left, 1st in the middle and tallest, 3rd on the right.
 * DOM order stays 1, 2, 3 so screen readers hear the ranking in order; CSS places the steps.
 */
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { Crown, ChevronUp, ChevronDown } from 'lucide-vue-next'
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
  /** places moved since the last event: positive is up */
  move?: number
  /** rating change at the last event */
  delta?: number
  /** results at the last event, in play order */
  form?: Array<'W' | 'L' | 'T'>
}

defineProps<{ entries: PodiumEntry[] }>()

const place = ['1st', '2nd', '3rd']
const medal = (i: number) => (i + 1) as 1 | 2 | 3
const word = { W: 'won', L: 'lost', T: 'tied' } as const
const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n))}`
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
        </span>
        <!-- the stand itself carries the numbers, like a scoreboard plinth; taller for first -->
        <span class="step__block">
          <span class="step__place num" aria-hidden="true">{{ i + 1 }}</span>
          <span class="step__rating num"><span class="visually-hidden">, rating </span>{{ Math.round(e.rating) }}</span>
          <span class="step__rec"><span class="visually-hidden">, record </span>{{ e.wins }}–{{ e.losses }}<template v-if="e.ties">–{{ e.ties }}</template></span>
          <span v-if="e.move || e.delta" class="step__move num">
            <span v-if="e.move && e.move > 0" class="up"><ChevronUp :size="14" aria-hidden="true" /><span class="visually-hidden">, up </span>{{ e.move }}</span>
            <span v-else-if="e.move && e.move < 0" class="down"><ChevronDown :size="14" aria-hidden="true" /><span class="visually-hidden">, down </span>{{ -e.move }}</span>
            <span v-if="e.delta"><span class="visually-hidden">, rating change last event </span>{{ signed(e.delta) }}</span>
          </span>
          <span v-if="e.form?.length" class="step__form">
            <span class="visually-hidden">, last event: {{ e.form.map(f => word[f]).join(', ') }}</span>
            <span v-for="(f, k) in e.form" :key="k" class="dot" :class="`dot--${f}`" aria-hidden="true" />
          </span>
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
.step__rating { font-size: var(--text-xl); line-height: 1; }
.step--1 .step__rating { font-size: 2.25rem; }
.step__rec { font-size: var(--text-sm); font-weight: 700; font-variant-numeric: tabular-nums; }
.step__move { display: inline-flex; flex-wrap: wrap; justify-content: center; align-items: center; column-gap: var(--s2); font-size: var(--text-sm); }
.step__move .up, .step__move .down { display: inline-flex; align-items: center; font-weight: 700; }
.step__move .up { color: var(--ok); }
.step__move .down { color: var(--bad); }
.step__form { display: inline-flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 2px; }
/* same shapes as standings rows: filled won, ring lost, bar tied */
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot--W { background: var(--ok); }
.dot--L { box-shadow: inset 0 0 0 2px var(--bad); }
.dot--T { height: 3px; border-radius: 2px; background: var(--ink-2); align-self: center; }

/* a plinth in a wash of its medal colour, edged in the full colour; text stays ink for contrast */
.step__block {
  --medal: var(--medal-1);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 22px 2px var(--s3);
  border: 2px solid var(--medal);
  border-bottom: 0;
  border-radius: var(--r-control) var(--r-control) 0 0;
  background: color-mix(in srgb, var(--medal) 18%, var(--surface));
  color: var(--ink);
  text-align: center;
}
.step--1 .step__block { min-height: 176px; }
.step--2 .step__block { --medal: var(--medal-2); min-height: 148px; }
.step--3 .step__block { --medal: var(--medal-3); min-height: 132px; }
/* the place sits on the plinth's top edge in the solid medal colour; fixed dark ink reads on all three */
.step__place {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--medal);
  color: #13233a;
  box-shadow: 0 0 0 3px var(--bg);
  font-weight: 700;
  font-size: var(--text-lg);
  line-height: 1;
}
.step__who { padding-bottom: 20px; }

@media (prefers-reduced-motion: no-preference) {
  .step__block { animation: rise 420ms var(--ease) both; transform-origin: bottom; }
  .step__block > * { animation: fade 300ms 380ms var(--ease) both; }
  .step--1 .step__block { animation-delay: 120ms; }
  .step--3 .step__block { animation-delay: 60ms; }
}
@keyframes rise { from { transform: scaleY(0.4); } }
@keyframes fade { from { opacity: 0; } }
</style>
