<script setup lang="ts">
import { RefreshCw, Play, ClipboardList } from 'lucide-vue-next'
import type { EventDto, GameDto } from '@/app/core/models/dto'
import AppButton from '@/app/core/ui/components/AppButton.vue'
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
    <div class="flex flex-col gap-2 rounded-xl border border-line bg-surface-1 p-4">
      <h2 class="flex items-center gap-2 text-base font-semibold text-ink">
        <ClipboardList class="size-5 text-brand" aria-hidden="true" />
        Schedule preview
      </h2>
      <p class="text-sm text-ink-muted">Review the generated matchups before you start scoring.</p>
      <GenerationMetaChips v-if="event.generationMeta" :meta="event.generationMeta" class="mt-1" />
    </div>

    <section v-for="(roundGames, roundIdx) in gamesByRound" :key="roundIdx" class="flex flex-col gap-2">
      <h3 class="px-1 text-sm font-semibold text-brand">Round {{ roundIdx + 1 }}</h3>
      <div class="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="game in roundGames"
          :key="game.id"
          class="flex flex-col gap-2 rounded-xl border border-line bg-surface-1 p-4"
        >
          <span class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Court {{ game.courtIndex + 1 }}
          </span>
          <div
            v-for="side in [1, 2] as const"
            :key="side"
            class="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2"
          >
            <span class="min-w-0 truncate text-sm font-medium text-ink">
              {{ (side === 1 ? game.team1 : game.team2).map((p) => p.displayName).join(' & ') }}
            </span>
            <span class="shrink-0 font-mono text-xs tabular-nums text-ink-faint">
              {{ Math.round((side === 1 ? game.team1Elo : game.team2Elo) || 0) }}
            </span>
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
        <AppButton class="flex-1 md:ml-auto md:flex-none" @click="emit('accept')">
          <Play class="size-4" aria-hidden="true" />
          Start scoring
        </AppButton>
      </div>
    </div>
  </div>
</template>
