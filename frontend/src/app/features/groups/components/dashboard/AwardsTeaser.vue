<script setup lang="ts">
import { computed } from 'vue'
import { Trophy, ChevronRight } from 'lucide-vue-next'
import type { AwardEditionDto } from '@/app/core/models/dto'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import LiveDot from '@/app/core/ui/components/LiveDot.vue'

const props = defineProps<{
  groupId: string
  edition: AwardEditionDto
}>()

const status = computed(() => {
  switch (props.edition.status) {
    case 'VOTING_OPEN':
      return { variant: 'live' as const, label: 'Voting open', live: true, caption: 'Cast your votes before the results are revealed.' }
    case 'CLOSED':
      return { variant: 'win' as const, label: 'Final', live: false, caption: 'The results are in — see who took home the hardware.' }
    default:
      return { variant: 'muted' as const, label: 'Setup', live: false, caption: 'The season superlatives are ready.' }
  }
})
</script>

<template>
  <RouterLink
    :to="`/groups/${groupId}/awards`"
    class="stadium-glow relative flex items-center gap-4 overflow-hidden rounded-[14px] border border-line bg-surface-1 p-4 transition-colors hover:bg-surface-2"
  >
    <span class="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent-text">
      <Trophy class="size-6" aria-hidden="true" />
    </span>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="display-wide truncate text-sm text-ink">{{ edition.title }}</h3>
        <TapeChip :variant="status.variant">
          <LiveDot v-if="status.live" />
          {{ status.label }}
        </TapeChip>
      </div>
      <p class="mt-1 truncate text-xs text-ink-muted">{{ status.caption }}</p>
    </div>
    <ChevronRight class="size-5 shrink-0 text-ink-faint" aria-hidden="true" />
  </RouterLink>
</template>
