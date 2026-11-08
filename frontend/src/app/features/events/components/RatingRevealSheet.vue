<script setup lang="ts">
/** After completion: the night's top three movers on a podium, then who moved and by how much, biggest gain first. */
import { computed } from 'vue'
import { ArrowUp, ArrowDown, Minus } from 'lucide-vue-next'
import type { RatingUpdateDto } from '@/app/core/models/dto'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import PlayerAvatar from '@/app/core/ui/PlayerAvatar.vue'
import { fmtDelta as fmt } from '../utils/superlatives'

const props = defineProps<{ open: boolean; updates: RatingUpdateDto[]; groupId: string }>()
const emit = defineEmits<{ close: [] }>()

const rows = computed(() => [...props.updates].sort((a, b) => b.delta - a.delta))
// only players who actually gained make the podium
const podium = computed(() => rows.value.slice(0, 3).filter(u => u.delta > 0))
const places = ['1st', '2nd', '3rd']
const medals = [1, 2, 3] as const
</script>

<template>
  <UiSheet :open="open" title="Ratings updated" :description="`${updates.length} players moved. Rankings are up to date.`" @close="emit('close')">
    <ol v-if="podium.length" role="list" class="podium" aria-label="Biggest movers">
      <li v-for="(u, i) in podium" :key="u.playerId" class="step" :class="`step--${i + 1}`">
        <PlayerAvatar :name="u.displayName" size="lg" :medal="medals[i]" :class="{ bounce: i === 0 }" />
        <span class="step__name truncate">{{ u.displayName }}</span>
        <span class="num step__delta">{{ fmt(u.delta) }}</span>
        <span class="step__block num"><span class="visually-hidden">{{ places[i] }} place</span><span aria-hidden="true">{{ i + 1 }}</span></span>
      </li>
    </ol>
    <!-- focusable so keyboard users can scroll the sheet when the list runs long -->
    <ul role="list" class="rows" tabindex="0" aria-label="Everyone's new rating">
      <li v-for="u in rows" :key="u.playerId" class="row">
        <span class="name truncate">{{ u.displayName }}</span>
        <span class="num rating">{{ Math.round(u.ratingAfter) }}</span>
        <span class="num delta" :class="u.delta > 0 ? 'up' : u.delta < 0 ? 'down' : ''">
          <ArrowUp v-if="u.delta > 0" :size="16" aria-hidden="true" />
          <ArrowDown v-else-if="u.delta < 0" :size="16" aria-hidden="true" />
          <Minus v-else :size="16" aria-hidden="true" />
          <span class="visually-hidden">{{ u.delta > 0 ? 'up' : u.delta < 0 ? 'down' : 'no change' }}</span>
          {{ fmt(u.delta) }}
        </span>
      </li>
    </ul>
    <template #actions>
      <UiButton variant="primary" size="lg" block :to="`/groups/${groupId}/rankings`">See rankings</UiButton>
      <UiButton variant="quiet" block @click="emit('close')">Back to the event</UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
/* DOM order is 1st, 2nd, 3rd for screen readers; the grid draws them 2nd, 1st, 3rd like a real podium */
.podium {
  list-style: none; margin: 0 0 var(--s4); padding: var(--s3) 0 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-areas: 'p2 p1 p3';
  align-items: end;
  gap: var(--s2);
}
.step { display: flex; flex-direction: column; align-items: center; gap: var(--s1); min-width: 0; }
.step--1 { grid-area: p1; }
.step--2 { grid-area: p2; }
.step--3 { grid-area: p3; }
.step :deep(.avatar) { margin-bottom: 6px; }
.step__name { max-width: 100%; font-weight: 700; font-size: var(--text-sm); text-align: center; }
.step__delta { font-size: var(--text-lg); font-weight: 700; color: var(--ok); line-height: 1; }
.step__block {
  width: 100%;
  display: grid; place-items: center;
  margin-top: var(--s1);
  border-radius: var(--r-control) var(--r-control) 0 0;
  background: var(--court-tint);
  border-bottom: 3px solid var(--court);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--ink);
}
.step--1 .step__block { height: 64px; }
.step--2 .step__block { height: 44px; }
.step--3 .step__block { height: 32px; font-size: var(--text-lg); }

/* one ball bounce for the night's top mover; never blocks a tap */
.bounce { animation: bounce 900ms var(--ease) 250ms 1 both; }
@keyframes bounce {
  0% { transform: translateY(0); }
  30% { transform: translateY(-16px); }
  55% { transform: translateY(0); }
  72% { transform: translateY(-6px); }
  88%, 100% { transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) { .bounce { animation: none; } }

.rows { display: flex; flex-direction: column; list-style: none; padding: 0; margin: 0; }
.row { display: flex; align-items: center; gap: var(--s3); min-height: 48px; border-bottom: 1px solid var(--line); }
.name { flex: 1; font-weight: 700; }
.rating { font-size: var(--text-lg); }
.delta { display: inline-flex; align-items: center; gap: 2px; min-width: 5ch; justify-content: flex-end; font-size: var(--text-md); color: var(--ink-2); }
.up { color: var(--ok); }
.down { color: var(--bad); }
</style>
