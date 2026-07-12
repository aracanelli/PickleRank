<script setup lang="ts">
import type { Streak } from '@/app/features/rankings/utils/match-derivations'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'

// Hottest / coldest current streaks. Streaks carry GROUP-PLAYER ids, which is
// exactly what profile routes want.
defineProps<{
  hot: Streak | null
  cold: Streak | null
  groupId: string
}>()
</script>

<template>
  <section v-if="hot || cold" class="grid grid-cols-2 gap-3">
    <RouterLink
      v-if="hot"
      :to="`/groups/${groupId}/players/${hot.groupPlayerId}`"
      class="flex min-w-0 flex-col gap-1.5 rounded-[14px] border border-line bg-surface-1 p-4 transition-colors hover:bg-surface-2"
    >
      <div><TapeChip variant="win">Hottest</TapeChip></div>
      <span class="truncate text-sm font-semibold text-ink">{{ hot.displayName }}</span>
      <span class="numeral h-8 text-2xl leading-8 text-win">W{{ hot.length }}</span>
    </RouterLink>

    <RouterLink
      v-if="cold"
      :to="`/groups/${groupId}/players/${cold.groupPlayerId}`"
      class="flex min-w-0 flex-col gap-1.5 rounded-[14px] border border-line bg-surface-1 p-4 transition-colors hover:bg-surface-2"
    >
      <div><TapeChip variant="loss">Coldest</TapeChip></div>
      <span class="truncate text-sm font-semibold text-ink">{{ cold.displayName }}</span>
      <span class="numeral h-8 text-2xl leading-8 text-loss">L{{ cold.length }}</span>
    </RouterLink>
  </section>
</template>
