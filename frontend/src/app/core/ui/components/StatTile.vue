<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: string | number
    /** Optional secondary line under the value. */
    detail?: string
    tone?: 'default' | 'brand' | 'win' | 'loss'
  }>(),
  { tone: 'default' }
)

const toneClass = {
  default: 'text-ink',
  brand: 'text-brand',
  win: 'text-win',
  loss: 'text-loss'
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-0.5 rounded-xl border border-line bg-surface-1 px-3.5 py-3">
    <span class="truncate text-xs font-semibold uppercase tracking-wide text-ink-faint">{{ label }}</span>
    <span class="font-mono text-xl font-semibold tabular-nums" :class="toneClass[tone]">{{ value }}</span>
    <span v-if="detail" class="truncate text-xs text-ink-faint">{{ detail }}</span>
  </div>
</template>
