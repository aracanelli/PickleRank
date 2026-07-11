<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    /** Show trailing chevron (navigational row). */
    chevron?: boolean
    clickable?: boolean
  }>(),
  { chevron: false, clickable: true }
)

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
    :class="clickable ? 'cursor-pointer hover:bg-surface-2 active:bg-surface-2' : ''"
    @click="clickable && emit('click')"
  >
    <span v-if="$slots.leading" class="shrink-0 text-ink-muted">
      <slot name="leading" />
    </span>
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate text-sm font-medium text-ink">{{ title }}</span>
      <span v-if="subtitle" class="truncate text-sm text-ink-faint">{{ subtitle }}</span>
    </span>
    <span v-if="$slots.trailing" class="shrink-0">
      <slot name="trailing" />
    </span>
    <ChevronRight v-if="chevron" class="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
  </component>
</template>
