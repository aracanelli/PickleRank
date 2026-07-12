<script setup lang="ts">
import { computed } from 'vue'
import type { PodiumItem } from './types'
import PodiumCard from './PodiumCard.vue'

// Top-3 strip in broadcast podium order: 2 — 1 — 3, center raised.
const props = defineProps<{
  /** Exactly the top three, ordered by rank ascending (1, 2, 3). */
  items: PodiumItem[]
  groupId: string
}>()

const columns = computed(() => {
  const [first, second, third] = props.items
  if (!first || !second || !third) return []
  return [second, first, third]
})
</script>

<template>
  <section v-if="columns.length" class="grid grid-cols-3 items-end gap-2">
    <PodiumCard
      v-for="(item, i) in columns"
      :key="item.playerId"
      class="podium-rise"
      :style="{ animationDelay: `${i * 120}ms` }"
      :item="item"
      :group-id="groupId"
      :center="i === 1"
      :class="i === 1 ? '' : 'mt-6'"
    />
  </section>
</template>

<style scoped>
/* Plinths rise into place, staggered left-to-right. */
.podium-rise {
  animation: podium-rise 480ms var(--ease-out) backwards;
}
@keyframes podium-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .podium-rise {
    animation: none;
  }
}
</style>
