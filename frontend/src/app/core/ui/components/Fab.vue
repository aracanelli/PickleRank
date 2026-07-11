<script setup lang="ts">
defineProps<{
  /** Accessible name; also shown as text on md+ screens. */
  label: string
}>()

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <!-- Sits above the bottom tab bar on mobile; regular corner FAB on desktop -->
  <button
    type="button"
    class="fixed right-4 z-40 flex min-h-14 items-center justify-center gap-2 rounded-full bg-brand px-4 font-semibold text-brand-contrast shadow-lg transition-transform hover:bg-brand-strong active:scale-95 md:right-8 md:bottom-8"
    style="bottom: calc(4.5rem + env(safe-area-inset-bottom))"
    :aria-label="label"
    @click="emit('click')"
  >
    <slot />
    <span class="hidden md:inline">{{ label }}</span>
  </button>
</template>
