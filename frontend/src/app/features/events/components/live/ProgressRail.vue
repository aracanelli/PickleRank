<script setup lang="ts">
import { computed } from 'vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'

const props = defineProps<{
  scored: number
  total: number
  /** Every game has both scores — the only state where completion is allowed. */
  allScoresEntered: boolean
  canManage: boolean
  completed: boolean
  completing: boolean
}>()

const emit = defineEmits<{ complete: [] }>()

const pct = computed(() => (props.total > 0 ? Math.round((props.scored / props.total) * 100) : 0))
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-court/95 pb-safe backdrop-blur">
    <div class="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3 md:px-6">
      <div class="min-w-0 flex-1">
        <p class="eyebrow text-ink-faint">
          <span class="text-ink">{{ scored }} / {{ total }}</span> scored
        </p>
        <div
          class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          :aria-valuenow="scored"
          :aria-valuemin="0"
          :aria-valuemax="total"
          aria-label="Games scored"
        >
          <div
            class="h-full rounded-full bg-accent-fill transition-[width] duration-[var(--dur-slow)]"
            :style="{ width: `${pct}%` }"
          />
        </div>
      </div>
      <AppButton
        v-if="canManage && !completed"
        variant="broadcast"
        :disabled="!allScoresEntered"
        :loading="completing"
        :title="!allScoresEntered ? 'Enter all scores to complete' : undefined"
        @click="emit('complete')"
      >
        Complete event
      </AppButton>
    </div>
  </div>
</template>
