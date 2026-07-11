<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    label?: string
    description?: string
    disabled?: boolean
  }>(),
  { disabled: false }
)

const model = defineModel<boolean>({ required: true })
const id = useId()
</script>

<template>
  <label :for="id" class="flex min-h-11 cursor-pointer items-center justify-between gap-4" :class="disabled ? 'opacity-50' : ''">
    <span v-if="label || description" class="flex flex-col">
      <span v-if="label" class="text-sm font-medium text-ink">{{ label }}</span>
      <span v-if="description" class="text-sm text-ink-faint">{{ description }}</span>
    </span>
    <button
      :id="id"
      type="button"
      role="switch"
      :aria-checked="model"
      :disabled="disabled"
      class="relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      :class="model ? 'bg-brand' : 'bg-surface-3'"
      @click="model = !model"
    >
      <span
        class="absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform"
        :class="model ? 'translate-x-5' : ''"
      />
    </button>
  </label>
</template>
