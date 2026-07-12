<script setup lang="ts">
import { computed } from 'vue'
import { Crown } from 'lucide-vue-next'
import type { PodiumItem } from './types'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import CountUpNumber from '@/app/core/ui/components/CountUpNumber.vue'

const props = defineProps<{
  item: PodiumItem
  groupId: string
  /** Rank-1 plinth: taller, crowned. */
  center?: boolean
}>()

// Profile routes take the GROUP-PLAYER id; when the mapping is missing
// (e.g. player left the group) the card renders inert.
const profileTo = computed(() =>
  props.item.groupPlayerId ? `/groups/${props.groupId}/players/${props.item.groupPlayerId}` : null
)

const delta = computed(() => props.item.delta ?? 0)
</script>

<template>
  <component
    :is="profileTo ? 'RouterLink' : 'div'"
    :to="profileTo ?? undefined"
    class="flex min-w-0 flex-col items-center gap-1.5 rounded-[14px] border border-line bg-surface-1 px-2 pb-4 text-center"
    :class="center ? 'pt-4' : 'pt-3'"
  >
    <Crown v-if="center" class="size-4 text-accent-text" aria-hidden="true" />
    <span class="numeral h-8 text-3xl leading-8 text-accent-text">{{ item.rank }}</span>
    <Avatar :name="item.name" :seed="item.playerId" :size="center ? 'lg' : 'md'" />
    <span class="w-full truncate text-sm font-semibold text-ink">{{ item.name }}</span>
    <span class="numeral h-6 text-xl leading-6 text-ink">
      <CountUpNumber :value="item.rating" />
    </span>
    <span
      v-if="delta !== 0"
      class="numeral h-4 text-xs leading-4"
      :class="delta > 0 ? 'text-win' : 'text-loss'"
    >
      {{ delta > 0 ? '▲' : '▼' }} {{ Math.abs(delta).toFixed(2) }}
    </span>
  </component>
</template>
