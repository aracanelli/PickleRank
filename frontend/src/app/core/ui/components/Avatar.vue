<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /** Highlight (e.g. the signed-in user's own player) with a volt ring. */
    brand?: boolean
    /** Stable seed for the gradient (player id); falls back to name. */
    seed?: string
  }>(),
  { size: 'md', brand: false }
)

const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
})

// Deterministic two-stop gradient seeded from the player id/name — the API
// has no photos, so identity comes from color.
const gradient = computed(() => {
  const seed = props.seed || props.name
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  const hue1 = hash % 360
  const hue2 = (hue1 + 40 + (hash % 60)) % 360
  return `linear-gradient(135deg, hsl(${hue1} 45% 38%), hsl(${hue2} 55% 26%))`
})

const sizeClasses = {
  sm: 'size-7 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-14 text-xl',
  xl: 'size-20 text-3xl'
}
</script>

<template>
  <span
    class="inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-bold text-white/90"
    :class="[sizeClasses[size], brand ? 'ring-2 ring-accent-fill ring-offset-2 ring-offset-surface-page' : '']"
    :style="{ background: gradient }"
    aria-hidden="true"
  >{{ initials }}</span>
</template>
