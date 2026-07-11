<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Trophy } from 'lucide-vue-next'
import type { RatingUpdateDto } from '@/app/core/models/dto'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'

const props = defineProps<{
  updates: RatingUpdateDto[]
  groupId: string
}>()

const open = defineModel<boolean>({ required: true })
const router = useRouter()

const sortedUpdates = computed(() => [...props.updates].sort((a, b) => b.delta - a.delta))

function formatDelta(delta: number) {
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`
}
</script>

<template>
  <Sheet v-model="open" title="Event completed">
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-3 rounded-xl bg-brand-soft p-4">
        <Trophy class="size-6 shrink-0 text-brand" aria-hidden="true" />
        <p class="text-sm text-ink">Ratings have been updated based on the results.</p>
      </div>

      <div class="flex flex-col gap-1.5">
        <div
          v-for="update in sortedUpdates"
          :key="update.playerId"
          class="flex items-center gap-3 rounded-xl border border-line bg-surface-1 px-3 py-2.5"
        >
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            {{ update.displayName }}
          </span>
          <span class="font-mono text-sm tabular-nums text-ink-muted">
            {{ Math.round(update.ratingBefore) }} → {{ Math.round(update.ratingAfter) }}
          </span>
          <span
            class="w-16 text-right font-mono text-sm font-semibold tabular-nums"
            :class="update.delta > 0 ? 'text-win' : update.delta < 0 ? 'text-loss' : 'text-ink-faint'"
          >
            <span aria-hidden="true">{{ update.delta > 0 ? '▲' : update.delta < 0 ? '▼' : '' }}</span>
            {{ formatDelta(update.delta) }}
          </span>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-col gap-2">
        <AppButton block @click="router.push(`/groups/${groupId}/rankings`)">View rankings</AppButton>
        <AppButton variant="secondary" block @click="router.push(`/groups/${groupId}`)">Back to group</AppButton>
      </div>
    </template>
  </Sheet>
</template>
