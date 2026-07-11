<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    label?: string
    hint?: string
    error?: string
    placeholder?: string
    rows?: number
    disabled?: boolean
  }>(),
  { rows: 3, disabled: false }
)

const model = defineModel<string>()
const id = useId()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" :for="id" class="text-sm font-medium text-ink">{{ label }}</label>
    <textarea
      :id="id"
      v-model="model"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="!!error || undefined"
      class="w-full rounded-xl border bg-surface-1 px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 disabled:opacity-50"
      :class="error ? 'border-loss focus:ring-loss/30' : 'border-line focus:border-brand focus:ring-brand/30'"
    />
    <p v-if="error" class="text-sm text-loss">{{ error }}</p>
    <p v-else-if="hint" class="text-sm text-ink-faint">{{ hint }}</p>
  </div>
</template>
