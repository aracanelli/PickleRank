<script setup lang="ts">
export interface SegmentOption {
  label: string
  value: string
  /** Shows a small dot indicator (e.g. round completion). */
  dot?: boolean
}

withDefaults(
  defineProps<{
    options: SegmentOption[]
    /** Allow horizontal scrolling when segments overflow (e.g. many rounds). */
    scrollable?: boolean
  }>(),
  { scrollable: false }
)

const model = defineModel<string>({ required: true })
</script>

<template>
  <div
    class="flex gap-1 rounded-xl bg-surface-2 p-1"
    :class="scrollable ? 'overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none]' : ''"
    role="tablist"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      role="tab"
      :aria-selected="model === opt.value"
      class="relative flex min-h-9 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors"
      :class="
        model === opt.value
          ? 'bg-surface-1 text-ink shadow-sm'
          : 'text-ink-muted hover:text-ink'
      "
      @click="model = opt.value"
    >
      {{ opt.label }}
      <span
        v-if="opt.dot"
        class="size-1.5 rounded-full"
        :class="model === opt.value ? 'bg-brand' : 'bg-brand/60'"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
