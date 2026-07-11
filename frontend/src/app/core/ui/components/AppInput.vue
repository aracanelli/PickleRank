<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    label?: string
    hint?: string
    error?: string
    type?: string
    placeholder?: string
    disabled?: boolean
    required?: boolean
    autocomplete?: string
    inputmode?: 'text' | 'numeric' | 'decimal' | 'email' | 'search' | 'tel' | 'url'
  }>(),
  { type: 'text', disabled: false, required: false }
)

const model = defineModel<string | number>()
const id = useId()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" :for="id" class="text-sm font-medium text-ink">
      {{ label }}<span v-if="required" class="text-loss"> *</span>
    </label>
    <div class="relative">
      <div v-if="$slots.leading" class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint">
        <slot name="leading" />
      </div>
      <input
        :id="id"
        v-model="model"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :aria-invalid="!!error || undefined"
        class="w-full min-h-11 rounded-xl border bg-surface-1 px-3.5 text-base text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 disabled:opacity-50"
        :class="[
          $slots.leading ? 'pl-10' : '',
          error
            ? 'border-loss focus:border-loss focus:ring-loss/30'
            : 'border-line focus:border-brand focus:ring-brand/30'
        ]"
      >
    </div>
    <p v-if="error" class="text-sm text-loss">{{ error }}</p>
    <p v-else-if="hint" class="text-sm text-ink-faint">{{ hint }}</p>
  </div>
</template>
