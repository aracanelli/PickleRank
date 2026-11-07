<script setup lang="ts">
/**
 * One component for the screen-level states that are not content:
 * loading, empty, error (with retry), denied (with a way out).
 */
import { RefreshCw } from 'lucide-vue-next'
import UiButton from './UiButton.vue'
import type { RouteLocationRaw } from 'vue-router'

withDefaults(defineProps<{
  kind: 'loading' | 'empty' | 'error' | 'denied'
  title?: string
  body?: string
  actionLabel?: string
  actionTo?: RouteLocationRaw
  /** h1 when the state is the whole screen (no PageHeader above it) */
  heading?: 'h1' | 'h2'
}>(), { heading: 'h2' })
const emit = defineEmits<{ action: []; retry: [] }>()
</script>

<template>
  <div v-if="kind === 'loading'" class="state state--loading" role="status" aria-live="polite">
    <span class="state__bar" aria-hidden="true" />
    <span class="state__bar" aria-hidden="true" />
    <span class="state__bar short" aria-hidden="true" />
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
.state__bar.short { width: 60%; height: 20px; }
@keyframes pulse { 50% { opacity: 0.55; } }
</style>
