<script setup lang="ts">
import { useId } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

export interface SelectOption {
  label: string
  value: string | number
  disabled?: boolean
}

withDefaults(
  defineProps<{
    options: SelectOption[]
    label?: string
    hint?: string
    error?: string
    disabled?: boolean
    placeholder?: string
  }>(),
  { disabled: false }
)

const model = defineModel<string | number>()
const id = useId()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" :for="id" class="text-sm font-medium text-ink">{{ label }}</label>
    <div class="relative">
      <!-- Native select: correct picker UX on mobile -->
      <select
        :id="id"
        v-model="model"
        :disabled="disabled"
        class="w-full min-h-11 appearance-none rounded-xl border bg-surface-1 px-3.5 pr-10 text-base text-ink transition-colors focus:outline-none focus:ring-2 disabled:opacity-50"
        :class="error ? 'border-loss focus:ring-loss/30' : 'border-line focus:border-brand focus:ring-brand/30'"
      >
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option v-for="opt in options" :key="String(opt.value)" :value="opt.value" :disabled="opt.disabled">
          {{ opt.label }}
        </option>
      </select>
      <ChevronDown class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
    </div>
    <p v-if="error" class="text-sm text-loss">{{ error }}</p>
    <p v-else-if="hint" class="text-sm text-ink-faint">{{ hint }}</p>
  </div>
</template>
