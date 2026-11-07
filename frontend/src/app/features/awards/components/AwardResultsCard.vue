<script setup lang="ts">
/** Final tally for one voting category: winner linked to their profile, then every nominee with votes. */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Trophy, ChevronRight } from 'lucide-vue-next'
import type { AwardCategoryDto } from '@/app/core/models/dto'

const props = defineProps<{
  category: AwardCategoryDto
  groupId: string
}>()

const results = computed(() => props.category.results ?? [])
const total = computed(() => props.category.totalVotes ?? 0)
const winner = computed(() => results.value[0] ?? null)
const votes = (n: number) => `${n} ${n === 1 ? 'vote' : 'votes'}`
</script>

<template>
  <article class="res">
    <h3>{{ category.title }}</h3>
    <p v-if="category.description" class="muted res__desc">{{ category.description }}</p>

    <template v-if="winner">
      <RouterLink :to="`/groups/${groupId}/players/${winner.nomineeGroupPlayerId}`" class="res__winner">
        <Trophy :size="20" aria-hidden="true" />
        <span class="res__wtext">
          <span class="res__label">Winner</span>
          <span class="res__name">{{ winner.displayName }}</span>
        </span>
        <span class="num res__count">{{ votes(winner.votes) }}</span>
        <ChevronRight :size="18" aria-hidden="true" />
      </RouterLink>

      <ol v-if="results.length > 1" role="list" class="res__list" :aria-label="`All votes for ${category.title}`">
        <li v-for="(r, i) in results.slice(1)" :key="r.nomineeGroupPlayerId" class="res__row">
          <span class="num res__rank">{{ i + 2 }}</span>
          <span class="truncate res__other">{{ r.displayName }}</span>
          <span class="num">{{ votes(r.votes) }}</span>
        </li>
      </ol>
      <p class="muted res__total"><span class="num">{{ total }}</span> {{ total === 1 ? 'vote' : 'votes' }} cast</p>
    </template>
    <p v-else class="muted">No votes were cast in this category.</p>
  </article>
</template>

<style scoped>
.res {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  padding: var(--s4) 0;
  border-bottom: 1px solid var(--line);
}
.res__desc, .res__total { font-size: var(--text-sm); }
.res__winner {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: 56px;
  padding: var(--s2) var(--s3);
  border-radius: var(--r-tile);
  background: var(--court-tint);
  color: var(--ink);
  text-decoration: none;
}
.res__winner svg { flex: none; }
.res__wtext { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.res__label { font-size: var(--text-sm); color: var(--ink-2); font-weight: 700; }
.res__name { font-weight: 700; overflow-wrap: anywhere; }
.res__count { flex: none; }
.res__list { display: flex; flex-direction: column; }
.res__row { display: flex; align-items: center; gap: var(--s3); min-height: 36px; }
.res__rank { width: 2ch; flex: none; text-align: center; color: var(--ink-2); }
.res__other { flex: 1; min-width: 0; }
</style>
