<script setup lang="ts">
export interface TabOption {
  label: string
  value: string
  count?: number
}

defineProps<{
  tabs: TabOption[]
}>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="border-b border-line" role="tablist">
    <div class="flex gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        role="tab"
        :aria-selected="model === tab.value"
        class="relative flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-4 text-sm font-medium transition-colors"
        :class="model === tab.value ? 'text-brand' : 'text-ink-muted hover:text-ink'"
        @click="model = tab.value"
      >
        {{ tab.label }}
        <span
          v-if="tab.count !== undefined"
          class="rounded-full bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-ink-muted"
        >{{ tab.count }}</span>
        <span
          v-if="model === tab.value"
          class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand"
        />
      </button>
    </div>
  </div>
</template>
