<script setup lang="ts">
import { computed } from 'vue'
import { Trophy, ChevronRight } from 'lucide-vue-next'
import type { AwardEditionDto } from '@/app/core/models/dto'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import LiveDot from '@/app/core/ui/components/LiveDot.vue'

// Season-capstone banner. Once awards exist they headline the dashboard, so
// this leans loud: full Volt when results are in, live-CTA while voting.
const props = defineProps<{
  groupId: string
  edition: AwardEditionDto
}>()

const status = computed(() => {
  switch (props.edition.status) {
    case 'VOTING_OPEN':
      return {
        loud: false,
        variant: 'live' as const,
        label: 'Voting open',
        live: true,
        headline: 'Awards voting is open',
        caption: 'Cast your votes before the results are revealed.'
      }
    case 'CLOSED':
      return {
        loud: true,
        variant: 'win' as const,
        label: 'Final',
        live: false,
        headline: 'The awards are in',
        caption: 'See who took home the hardware.'
      }
    default:
      return {
        loud: false,
        variant: 'muted' as const,
        label: 'Setup',
        live: false,
        headline: props.edition.title,
        caption: 'The season superlatives are ready.'
      }
  }
})
</script>

<template>
  <!-- CLOSED: full-accent banner, impossible to miss -->
  <RouterLink
    v-if="status.loud"
    :to="`/groups/${groupId}/awards`"
    class="relative flex items-center gap-4 overflow-hidden rounded-[18px] bg-accent-fill p-4 text-accent-contrast transition-transform active:scale-[0.99]"
  >
    <span
      class="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-black/10"
    >
      <Trophy class="size-6" aria-hidden="true" />
    </span>
    <div class="min-w-0 flex-1">
      <p class="truncate text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">
        {{ edition.title }}
      </p>
      <h3 class="display-wide mt-0.5 truncate text-lg leading-tight">{{ status.headline }}</h3>
      <p class="mt-0.5 truncate text-xs opacity-80">{{ status.caption }}</p>
    </div>
    <ChevronRight class="size-5 shrink-0 opacity-80" aria-hidden="true" />
  </RouterLink>

  <!-- DRAFT / VOTING_OPEN: prominent card with status chip -->
  <RouterLink
    v-else
    :to="`/groups/${groupId}/awards`"
    class="stadium-glow relative flex items-center gap-4 overflow-hidden rounded-[18px] border border-line bg-surface-court p-4 transition-colors hover:bg-surface-2"
  >
    <span class="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent-text">
      <Trophy class="size-6" aria-hidden="true" />
    </span>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="display-wide truncate text-base text-ink">{{ status.headline }}</h3>
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
