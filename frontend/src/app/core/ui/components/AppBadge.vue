<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'brand' | 'success' | 'warning' | 'error' | 'info' | 'muted'
  }>(),
  { variant: 'muted' }
)

const classes = computed(() => {
  const variants = {
    brand: 'bg-brand-soft text-brand',
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
    class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide leading-tight"
    :class="classes"
  >
    <slot />
  </span>
</template>
