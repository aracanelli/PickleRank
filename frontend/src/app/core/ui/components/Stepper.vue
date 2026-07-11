<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    label?: string
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    /** Larger value text — for courtside score entry. */
    size?: 'md' | 'lg'
  }>(),
  { min: 0, max: 99, step: 1, disabled: false, size: 'md' }
)

const model = defineModel<number>({ required: true })

function adjust(delta: number) {
  const next = model.value + delta
  if (next < props.min || next > props.max) return
  model.value = next
}
</script>

<template>
  <div class="flex flex-col items-center gap-1.5">
    <span v-if="label" class="text-sm font-medium text-ink-muted">{{ label }}</span>
    <div class="flex items-center gap-1 rounded-xl border border-line bg-surface-1">
      <button
        type="button"
        class="flex min-h-11 min-w-11 items-center justify-center rounded-l-xl text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
        :disabled="disabled || model - step < min"
        :aria-label="`Decrease ${label || 'value'}`"
        @click="adjust(-step)"
      >
        <Minus class="size-5" />
      </button>
      <span
        class="min-w-10 text-center font-mono font-semibold tabular-nums text-ink"
        :class="size === 'lg' ? 'text-3xl min-w-14' : 'text-lg'"
        aria-live="polite"
      >{{ model }}</span>
      <button
        type="button"
        class="flex min-h-11 min-w-11 items-center justify-center rounded-r-xl text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
        :disabled="disabled || model + step > max"
        :aria-label="`Increase ${label || 'value'}`"
        @click="adjust(step)"
      >
        <Plus class="size-5" />
      </button>
    </div>
  </div>
</template>
