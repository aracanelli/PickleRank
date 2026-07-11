<script setup lang="ts">
import SegmentedControl, { type SegmentOption } from '@/app/core/ui/components/SegmentedControl.vue'

defineProps<{
  /** One segment per round; dot = every game in the round has both scores. */
  options: SegmentOption[]
}>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <!-- Sticks just below the app header while scrolling through games -->
  <div class="sticky top-14 z-30 -mx-4 bg-surface-page/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
    <div class="flex items-center gap-2">
      <SegmentedControl v-model="model" :options="options" scrollable class="min-w-0 flex-1" />
      <slot />
    </div>
  </div>
</template>
