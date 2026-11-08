<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import PlayerAvatar from './PlayerAvatar.vue'

defineProps<{
  rank: number
  name: string
  rating: number
  wins: number
  losses: number
  ties: number
  to?: RouteLocationRaw
  isMe?: boolean
  sub?: boolean
  /** jersey colour key: global player id */
  /** last results, newest first */
  form?: Array<'W' | 'L' | 'T'>
}>()

const word = { W: 'won', L: 'lost', T: 'tied' } as const
</script>

<template>
  <component :is="to ? RouterLink : 'div'" :to="to" class="srow" :class="{ 'srow--me': isMe }">
    <span class="srow__rank num" :class="{ 'srow__rank--top': rank <= 3 }">{{ rank }}</span>
    <PlayerAvatar :name="name" size="sm" />
    <span class="srow__who">
      <span class="srow__name truncate">{{ name }}<span v-if="isMe" class="srow__you"> (you)</span></span>
      <span class="srow__rec muted">
        <span class="visually-hidden">Record: </span>{{ wins }}–{{ losses }}<template v-if="ties">–{{ ties }}</template>
        <span v-if="sub">, sub</span>
        <span v-if="form?.length" class="form">
          <span class="visually-hidden">, last {{ form.length }}: {{ form.map(f => word[f]).join(', ') }}</span>
          <!-- shape carries the meaning too: filled won, ring lost, bar tied -->
          <span v-for="(f, i) in form" :key="i" class="form__dot" :class="`form__dot--${f}`" aria-hidden="true" />
        </span>
      </span>
    </span>
    <span class="srow__rating num"><span class="visually-hidden">Rating </span>{{ Math.round(rating) }}</span>
    <ChevronRight v-if="to" :size="18" class="srow__chev" aria-hidden="true" />
  </component>
</template>

<style scoped>
.srow {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: 56px;
  padding: var(--s2) var(--s2) var(--s2) 0;
  color: var(--ink);
  text-decoration: none;
  border-bottom: 1px solid var(--line);
}
.srow--me { background: var(--court-tint); margin-inline: calc(var(--s2) * -1); padding-inline: var(--s2) var(--s4); border-radius: var(--r-control); }
.srow__rank {
  width: 2.25rem;
  flex: none;
  text-align: center;
  font-size: var(--text-lg);
  color: var(--ink-2);
}
.srow__rank--top { color: var(--ink); font-weight: 700; }
.srow__who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.srow__name { font-weight: 700; }
.srow__you { font-weight: 400; color: var(--ink-2); }
.srow__rec { font-size: var(--text-sm); font-variant-numeric: tabular-nums; display: flex; align-items: center; flex-wrap: wrap; column-gap: 2px; }
.srow__rating { font-size: var(--text-lg); }
.srow__chev { color: var(--ink-2); flex: none; }

.form { display: inline-flex; align-items: center; gap: 3px; margin-left: var(--s2); }
.form__dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.form__dot--W { background: var(--ok); }
.form__dot--L { box-shadow: inset 0 0 0 2px var(--bad); }
.form__dot--T { height: 3px; border-radius: 2px; background: var(--ink-2); }
</style>
