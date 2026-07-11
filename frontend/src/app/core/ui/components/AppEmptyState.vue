<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-12 text-center">
    <div v-if="$slots.icon" class="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
      <slot name="icon" />
    </div>
    <h3 class="text-base font-semibold text-ink">{{ title }}</h3>
    <p v-if="description" class="max-w-sm text-sm text-ink-muted">{{ description }}</p>
    <div v-if="$slots.action" class="mt-2">
      <slot name="action" />
    </div>
  </div>
</template>
