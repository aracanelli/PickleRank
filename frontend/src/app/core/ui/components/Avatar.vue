<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    size?: 'sm' | 'md' | 'lg'
    /** Highlight (e.g. the signed-in user's own player). */
    brand?: boolean
  }>(),
  { size: 'md', brand: false }
)

const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
})

const sizeClasses = { sm: 'size-7 text-xs', md: 'size-9 text-sm', lg: 'size-14 text-xl' }
</script>

<template>
  <span
    class="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold"
    :class="[sizeClasses[size], brand ? 'bg-brand text-brand-contrast' : 'bg-surface-3 text-ink-muted']"
    aria-hidden="true"
  >{{ initials }}</span>
</template>
