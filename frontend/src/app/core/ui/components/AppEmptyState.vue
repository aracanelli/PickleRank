<script setup lang="ts">
import CourtLines from './CourtLines.vue'

withDefaults(
  defineProps<{
    title: string
    description?: string
    /** Renders a faint court diagram behind the content. */
    court?: boolean
  }>(),
  { court: false }
)
</script>

<template>
  <div class="relative flex flex-col items-center gap-3 overflow-hidden rounded-[14px] border border-dashed border-line px-6 py-12 text-center">
    <CourtLines
      v-if="court"
      crop="corner"
      class="absolute -right-4 -top-4 h-40 w-auto"
    />
    <div v-if="$slots.icon" class="relative flex size-14 items-center justify-center rounded-[14px] bg-accent-soft text-accent-text">
      <slot name="icon" />
    </div>
    <h3 class="relative text-base font-semibold text-ink">{{ title }}</h3>
    <p v-if="description" class="relative max-w-sm text-sm text-ink-muted">{{ description }}</p>
    <div v-if="$slots.action" class="relative mt-2">
      <slot name="action" />
    </div>
  </div>
</template>
