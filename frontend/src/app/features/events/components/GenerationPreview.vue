<script setup lang="ts">
import { RefreshCw, Play } from 'lucide-vue-next'
import type { EventDto, GameDto } from '@/app/core/models/dto'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import CourtLines from '@/app/core/ui/components/CourtLines.vue'
import GenerationMetaChips from './GenerationMetaChips.vue'

defineProps<{
  event: EventDto
  gamesByRound: GameDto[][]
  generating: boolean
}>()

const emit = defineEmits<{ regenerate: []; accept: [] }>()
</script>

<template>
  <!-- Extra bottom padding keeps the last round clear of the fixed footer -->
  <div class="flex flex-col gap-4 pb-28">
    <div class="relative flex flex-col gap-2 overflow-hidden rounded-[20px] border border-line-strong bg-surface-1 p-5 ticket-clip">
      <div class="pointer-events-none absolute inset-y-0 right-0 w-40" aria-hidden="true">
        <CourtLines crop="half" class="h-full w-full" />
      </div>
      <p class="eyebrow relative text-ink-faint">Schedule preview</p>
      <h2 class="display-wide relative text-xl text-ink">Tonight's matchups</h2>
      <p class="relative text-sm text-ink-muted">Review the generated matchups before you start scoring.</p>
      <GenerationMetaChips v-if="event.generationMeta" :meta="event.generationMeta" class="relative mt-1" />
    </div>

    <section v-for="(roundGames, roundIdx) in gamesByRound" :key="roundIdx" class="flex flex-col gap-2">
      <p class="eyebrow px-1 text-ink-faint">
        Round <span class="text-ink">{{ roundIdx + 1 }}</span>
      </p>
      <div class="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        <!-- Read-only court cards -->
        <article
          v-for="game in roundGames"
          :key="game.id"
          class="flex flex-col gap-1.5 rounded-[14px] border border-line bg-surface-1 p-4"
        >
          <div>
            <TapeChip variant="muted">Court {{ game.courtIndex + 1 }}</TapeChip>
          </div>
          <div class="flex flex-col">
            <div v-for="side in [1, 2] as const" :key="side" class="contents">
              <div v-if="side === 2" class="kitchen-line my-1" aria-hidden="true" />
              <div class="flex items-center justify-between gap-3 py-1.5">
                <span class="min-w-0 truncate text-sm font-semibold text-ink">
                  {{ (side === 1 ? game.team1 : game.team2).map((p) => p.displayName).join(' & ') }}
                </span>
                <span class="shrink-0 font-mono text-xs tabular-nums text-ink-faint">
                  {{ Math.round((side === 1 ? game.team1Elo : game.team2Elo) || 0) }}
                </span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- Sticky footer: regenerate or accept the preview -->
    <div class="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface-page/95 pb-safe backdrop-blur md:bottom-0">
      <div class="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 md:px-6">
        <AppButton variant="secondary" :loading="generating" class="flex-1 md:flex-none" @click="emit('regenerate')">
          <RefreshCw class="size-4" aria-hidden="true" />
          Regenerate
        </AppButton>
        <AppButton variant="broadcast" class="flex-1 md:ml-auto md:flex-none" @click="emit('accept')">
          <Play class="size-4" aria-hidden="true" />
          Start scoring
        </AppButton>
      </div>
    </div>
  </div>
</template>
