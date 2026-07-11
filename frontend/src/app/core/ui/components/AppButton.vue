<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'broadcast'
    size?: 'md' | 'sm'
    type?: 'button' | 'submit'
    loading?: boolean
    disabled?: boolean
    block?: boolean
  }>(),
  { variant: 'primary', size: 'md', type: 'button', loading: false, disabled: false, block: false }
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const classes = computed(() => {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-[10px] transition-colors ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ' +
    'disabled:opacity-50 disabled:pointer-events-none select-none active:scale-[0.98]'
  const sizes = {
    md: 'min-h-11 px-5 text-base',
    sm: 'min-h-9 px-3.5 text-sm'
  }
  const variants = {
    primary: 'bg-accent-fill text-accent-contrast hover:brightness-110 active:brightness-95',
    secondary: 'bg-surface-2 text-ink border border-line-strong hover:bg-surface-3',
    ghost: 'bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink',
    danger: 'bg-loss text-white hover:brightness-110',
    // Big CTA — the only button that speaks in the display voice.
    broadcast:
      'bg-accent-fill text-accent-contrast hover:brightness-110 active:brightness-95 ' +
      'ticket-clip min-h-12 px-6 display-wide text-sm tracking-[0.08em]'
  }
  // Regular buttons stay in the body voice; broadcast carries its own type + size.
  const typography = props.variant === 'broadcast' ? '' : 'font-sans font-semibold'
  return [
    base,
    typography,
    props.variant === 'broadcast' ? '' : sizes[props.size],
    variants[props.variant],
    props.block ? 'w-full' : ''
  ].join(' ')
})
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :data-variant="variant"
    :disabled="disabled || loading"
    @click="emit('click', $event)"
  >
    <Loader2 v-if="loading" class="size-4 animate-spin" aria-hidden="true" />
    <slot />
  </button>
</template>
