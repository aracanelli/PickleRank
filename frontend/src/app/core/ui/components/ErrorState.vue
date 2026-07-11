<script setup lang="ts">
import { AlertCircle, RotateCcw } from 'lucide-vue-next'
import AppButton from './AppButton.vue'

withDefaults(
  defineProps<{
    message?: string
    retryable?: boolean
  }>(),
  { message: 'Something went wrong', retryable: true }
)

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface-1 px-6 py-10 text-center">
    <div class="flex size-12 items-center justify-center rounded-2xl bg-loss/10 text-loss">
      <AlertCircle class="size-6" />
    </div>
    <p class="max-w-sm text-sm text-ink-muted">{{ message }}</p>
    <AppButton v-if="retryable" variant="secondary" size="sm" @click="emit('retry')">
      <RotateCcw class="size-4" />
      Try again
    </AppButton>
  </div>
</template>
