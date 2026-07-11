<script setup lang="ts">
import { X } from 'lucide-vue-next'
import Avatar from './Avatar.vue'

withDefaults(
  defineProps<{
    name: string
    removable?: boolean
  }>(),
  { removable: false }
)

const emit = defineEmits<{ remove: [] }>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1 pr-2.5 text-sm font-medium text-ink">
    <Avatar :name="name" size="sm" />
    {{ name }}
    <button
      v-if="removable"
      type="button"
      class="-mr-1 flex size-6 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
      :aria-label="`Remove ${name}`"
      @click="emit('remove')"
    >
      <X class="size-3.5" />
    </button>
  </span>
</template>
