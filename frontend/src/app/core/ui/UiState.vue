<script setup lang="ts">
/**
 * One component for the screen-level states that are not content:
 * loading, empty, error (with retry), denied (with a way out).
 */
import { computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import UiButton from './UiButton.vue'
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(defineProps<{
  kind: 'loading' | 'empty' | 'error' | 'denied'
  title?: string
  body?: string
  actionLabel?: string
  actionTo?: RouteLocationRaw
  /** h1 when the state is the whole screen (no PageHeader above it) */
  heading?: 'h1' | 'h2'
  /** loading only: a skeleton shaped like the content it stands in for, so nothing jumps when it lands */
  shape?: 'default' | 'home' | 'list' | 'board' | 'header'
}>(), { heading: 'h2', shape: 'default' })
const emit = defineEmits<{ action: []; retry: [] }>()

// [height px, width %] per block; sized to the real components (court tile, podium, rows)
const SHAPES: Record<string, Array<[number, number]>> = {
  default: [[64, 100], [64, 100], [20, 60]],
  header: [[22, 40], [40, 75], [18, 55]],
  home: [[96, 100], [24, 35], [176, 100], [52, 100], [52, 100]],
  list: [[56, 100], [56, 100], [56, 100], [56, 100], [56, 100]],
  board: [[28, 45], [132, 100], [132, 100], [132, 100]]
}
const blocks = computed(() => SHAPES[props.shape] ?? SHAPES.default)

</script>

<template>
  <div v-if="kind === 'loading'" class="state state--loading" role="status" aria-live="polite">
    <span
      v-for="([h, w], i) in blocks" :key="i"
      class="state__bar" aria-hidden="true"
      :style="{ height: `${h}px`, width: `${w}%` }"
    />
    <span class="visually-hidden">{{ title || 'Loading' }}</span>
  </div>
  <div v-else class="state" :role="kind === 'error' ? 'alert' : undefined">
    <component :is="heading" class="state__title">{{ title }}</component>
    <p v-if="body" class="muted">{{ body }}</p>
    <slot />
    <UiButton v-if="kind === 'error'" variant="primary" @click="emit('retry')">
      <RefreshCw :size="18" aria-hidden="true" /> {{ actionLabel || 'Try again' }}
    </UiButton>
    <UiButton v-else-if="actionLabel" :variant="kind === 'empty' ? 'primary' : 'secondary'" :to="actionTo" @click="emit('action')">
      {{ actionLabel }}
    </UiButton>
  </div>
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s3);
  padding: var(--s5) 0;
}
.state__title { font-size: var(--text-lg); }
.state p { max-width: 36ch; }
.state--loading { gap: var(--s3); }
.state__bar {
  display: block;
  height: 64px;
  width: 100%;
  border-radius: var(--r-tile);
  background: var(--surface-sunk);
  animation: pulse 1.4s ease-in-out infinite;
}
.state--loading { padding: var(--s2) 0; }
@keyframes pulse { 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) { .state__bar { animation: none; } }
</style>
