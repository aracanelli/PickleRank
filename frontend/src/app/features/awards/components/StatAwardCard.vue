<script setup lang="ts">
/** One season award row: title, winner (and partner for pairings) as profile links, the figure, and why. */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import type { StatAwardDto } from '@/app/core/models/dto'

const props = defineProps<{
  award: StatAwardDto
  groupId: string
}>()

const winners = computed(() => (props.award.partner ? [props.award.winner, props.award.partner] : [props.award.winner]))
</script>

<template>
  <article class="stat">
    <h3>{{ award.title }}</h3>
    <ul role="list" class="stat__who">
      <li v-for="w in winners" :key="w.groupPlayerId">
        <RouterLink :to="`/groups/${groupId}/players/${w.groupPlayerId}`" class="stat__link">
          <span class="truncate">{{ w.displayName }}</span>
          <ChevronRight :size="18" aria-hidden="true" />
        </RouterLink>
      </li>
    </ul>
    <p class="stat__fig">
      <span class="num stat__value">{{ Number.isInteger(award.value) ? award.value : award.value.toFixed(1) }}</span>
      <span v-if="award.detail" class="muted">{{ award.detail }}</span>
    </p>
    <p class="muted stat__blurb">{{ award.blurb }}</p>
  </article>
</template>

<style scoped>
.stat {
  display: flex;
  flex-direction: column;
  gap: var(--s1);
  padding: var(--s4) 0;
  border-bottom: 1px solid var(--line);
}
.stat__who { display: flex; flex-direction: column; }
.stat__link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s2);
  min-height: var(--tap);
  font-weight: 700;
  font-size: var(--text-lg);
  color: var(--ink);
  text-decoration: none;
}
.stat__link svg { flex: none; color: var(--ink-2); }
.stat__fig { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s2); }
.stat__value { font-size: var(--num-md); line-height: 1; color: var(--court); }
.stat__blurb { font-size: var(--text-sm); }
</style>
