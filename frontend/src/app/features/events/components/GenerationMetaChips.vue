<script setup lang="ts">
import { computed } from 'vue'
import type { GenerationMeta } from '@/app/core/models/dto'

const props = defineProps<{ meta: GenerationMeta }>()

const chips = computed(() => {
  const list = [
    { key: 'seed', label: `Seed ${props.meta.seedUsed}` },
    { key: 'elo', label: `ELO diff ${(props.meta.eloDiffUsed * 100).toFixed(0)}%` }
  ]
  if (props.meta.relaxIterations > 0) {
    list.push({ key: 'relax', label: `Relaxed ${props.meta.relaxIterations}×` })
  }
  list.push({ key: 'attempts', label: `${props.meta.attempts} attempt${props.meta.attempts === 1 ? '' : 's'}` })
  list.push({ key: 'duration', label: `${props.meta.durationMs}ms` })
  return list
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <span
      v-for="chip in chips"
      :key="chip.key"
      class="inline-flex max-w-40 items-center truncate rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[0.6875rem] tabular-nums text-ink-muted"
    >
      {{ chip.label }}
    </span>
  </div>
</template>
