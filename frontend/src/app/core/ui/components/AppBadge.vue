<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'brand' | 'success' | 'warning' | 'error' | 'info' | 'muted'
  }>(),
  { variant: 'muted' }
)

// Compat path to the COURTSIDE "tape" look — box skews, text un-skews.
// TapeChip is the richer new primitive; AppBadge keeps the old API.
const classes = computed(() => {
  const variants = {
    brand: 'bg-accent-soft text-accent-text',
    success: 'bg-win/15 text-win',
    warning: 'bg-warn/15 text-warn',
    error: 'bg-loss/15 text-loss',
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
