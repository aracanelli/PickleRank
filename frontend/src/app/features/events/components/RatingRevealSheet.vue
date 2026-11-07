<script setup lang="ts">
/** After completion: who moved and by how much, biggest gain first. */
import { computed } from 'vue'
import { ArrowUp, ArrowDown, Minus } from 'lucide-vue-next'
import type { RatingUpdateDto } from '@/app/core/models/dto'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'

const props = defineProps<{ open: boolean; updates: RatingUpdateDto[]; groupId: string }>()
const emit = defineEmits<{ close: [] }>()

const rows = computed(() => [...props.updates].sort((a, b) => b.delta - a.delta))
const fmt = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`
</script>

<template>
  <UiSheet :open="open" title="Ratings updated" :description="`${updates.length} players moved. Rankings are up to date.`" @close="emit('close')">
    <ul role="list" class="rows">
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
.rows { display: flex; flex-direction: column; list-style: none; padding: 0; margin: 0; }
.row { display: flex; align-items: center; gap: var(--s3); min-height: 48px; border-bottom: 1px solid var(--line); }
.name { flex: 1; font-weight: 700; }
.rating { font-size: var(--text-lg); }
.delta { display: inline-flex; align-items: center; gap: 2px; min-width: 5ch; justify-content: flex-end; font-size: var(--text-md); color: var(--ink-2); }
.up { color: var(--ok); }
.down { color: var(--bad); }
</style>
