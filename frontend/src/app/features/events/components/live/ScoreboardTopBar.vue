<script setup lang="ts">
import { ChevronLeft, ArrowLeftRight } from 'lucide-vue-next'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import LiveDot from '@/app/core/ui/components/LiveDot.vue'

defineProps<{
  eventName: string
  rounds: number
  currentRound: number
  /** Per-round flag: every game in the round has both scores. */
  roundScored: boolean[]
  /** Show the LIVE tape (event IN_PROGRESS). */
  live: boolean
  /** Show the swap-players shortcut. */
  canSwap: boolean
}>()

const emit = defineEmits<{ exit: []; select: [roundIndex: number]; swap: [] }>()
</script>

<template>
  <header class="flex items-center gap-1 px-2 py-2">
    <button
      type="button"
      class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink"
      aria-label="Exit scoreboard"
      @click="emit('exit')"
    >
      <ChevronLeft class="size-6" aria-hidden="true" />
    </button>

    <div class="flex min-w-0 flex-1 items-center gap-2">
      <p class="eyebrow min-w-0 truncate text-ink-faint">{{ eventName }}</p>
      <TapeChip v-if="live" variant="live"><LiveDot /> Live</TapeChip>
    </div>

    <!-- Round indicator dots -->
    <div class="flex shrink-0 items-center" role="tablist" aria-label="Rounds">
      <button
        v-for="i in rounds"
        :key="i"
        type="button"
        role="tab"
        class="flex min-h-11 min-w-6 items-center justify-center"
        :aria-selected="currentRound === i - 1"
        :aria-label="`Round ${i}${roundScored[i - 1] ? ' (scored)' : ''}`"
        @click="emit('select', i - 1)"
      >
        <span
          class="rounded-full transition-all duration-[var(--dur-fast)]"
          :class="[
            currentRound === i - 1 ? 'size-3' : 'size-2',
            roundScored[i - 1]
              ? 'bg-accent-fill'
              : currentRound === i - 1
                ? 'ring-2 ring-inset ring-line-strong bg-surface-2'
                : 'ring-1 ring-inset ring-line-strong'
          ]"
        />
      </button>
    </div>

    <button
      v-if="canSwap"
      type="button"
      class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink"
      aria-label="Swap players in this round"
      @click="emit('swap')"
    >
      <ArrowLeftRight class="size-5" aria-hidden="true" />
    </button>
  </header>
</template>
