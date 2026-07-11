<script setup lang="ts">
import { computed } from 'vue'

// Skewed "tape" chip — the COURTSIDE badge. Box skews, text un-skews.
const props = withDefaults(
  defineProps<{
    variant?: 'volt' | 'live' | 'win' | 'loss' | 'tie' | 'warn' | 'info' | 'muted'
  }>(),
  { variant: 'muted' }
)

const classes = computed(() => {
  const variants = {
    volt: 'bg-accent-fill text-accent-contrast',
    live: 'bg-accent-fill text-accent-contrast',
    win: 'bg-win/15 text-win',
    loss: 'bg-loss/15 text-loss',
    tie: 'bg-tie/15 text-tie',
    warn: 'bg-warn/15 text-warn',
    info: 'bg-info/15 text-info',
    muted: 'bg-surface-2 text-ink-muted'
  }
  return variants[props.variant]
})
</script>

<template>
  <span
    class="inline-flex -skew-x-6 items-center gap-1 whitespace-nowrap rounded-[4px] px-2 py-0.5"
    :class="classes"
    :data-variant="variant"
  >
    <span class="inline-flex skew-x-6 items-center gap-1 eyebrow">
      <slot />
    </span>
  </span>
</template>
