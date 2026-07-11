<script setup lang="ts">
import { computed } from 'vue'
import type { GroupPlayerDto, EventListItemDto } from '@/app/core/models/dto'
import StatTile from '@/app/core/ui/components/StatTile.vue'

const props = defineProps<{
  players: GroupPlayerDto[]
  events: EventListItemDto[]
}>()

const eventsPlayed = computed(
  () => props.events.filter((e) => e.status === 'COMPLETED').length
)

const topPlayer = computed(() => {
  if (props.players.length === 0) return null
  return props.players.reduce((best, p) => (p.rating > best.rating ? p : best))
})
</script>

<template>
  <div class="grid grid-cols-3 gap-2">
    <StatTile label="Players" :value="players.length" />
    <StatTile label="Events" :value="eventsPlayed" detail="played" />
    <StatTile
      label="Top player"
      :value="topPlayer ? topPlayer.rating.toFixed(1) : '—'"
      :detail="topPlayer?.displayName"
      tone="brand"
    />
  </div>
</template>
