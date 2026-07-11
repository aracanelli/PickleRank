<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Accessible name — required, icon-only buttons have no visible text. */
    label: string
    variant?: 'default' | 'brand' | 'danger'
    disabled?: boolean
  }>(),
  { variant: 'default', disabled: false }
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const classes = computed(() => {
  const base =
    'inline-flex items-center justify-center min-h-11 min-w-11 rounded-xl transition-colors ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ' +
    'disabled:opacity-50 disabled:pointer-events-none active:scale-95'
  const variants = {
    default: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
    brand: 'text-brand hover:bg-brand-soft',
    danger: 'text-loss hover:bg-loss/10'
  }
  return [base, variants[props.variant]].join(' ')
})
</script>

<template>
  <button type="button" :class="classes" :aria-label="label" :title="label" :disabled="disabled" @click="emit('click', $event)">
    <slot />
  </button>
</template>
