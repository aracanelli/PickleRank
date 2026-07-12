<script setup lang="ts">
import { computed } from 'vue'
import { Check, Loader2, MoreVertical } from 'lucide-vue-next'
import type { GameDto } from '@/app/core/models/dto'
import IconButton from '@/app/core/ui/components/IconButton.vue'

const props = withDefaults(
  defineProps<{
    game: GameDto
    saving?: boolean
    saved?: boolean
    /** Tap-to-score is enabled (organizer + event not completed). */
    interactive?: boolean
    /** Show the per-game overflow menu button. */
    showMenu?: boolean
  }>(),
  { saving: false, saved: false, interactive: false, showMenu: false }
)

const emit = defineEmits<{ open: []; menu: [] }>()

type Side = 1 | 2

function teamClasses(side: Side) {
  const { result } = props.game
  if (result === 'TIE') return 'text-tie'
  if (result === 'TEAM1_WIN') return side === 1 ? 'text-win' : 'text-ink-muted'
  if (result === 'TEAM2_WIN') return side === 2 ? 'text-win' : 'text-ink-muted'
  return 'text-ink'
}

const hasResult = computed(() => props.game.result !== 'UNSET')

function onCardClick() {
  if (props.interactive) emit('open')
}
</script>

<template>
  <article
    class="overflow-hidden rounded-xl border border-line bg-surface-1 transition-colors"
    :class="[
      interactive ? 'cursor-pointer hover:bg-surface-2/50 active:bg-surface-2' : '',
      game.result === 'TEAM1_WIN' || game.result === 'TEAM2_WIN' ? 'border-l-4 border-l-win' : '',
      game.result === 'TIE' ? 'border-l-4 border-l-tie' : ''
    ]"
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive ? 0 : undefined"
    :aria-label="interactive ? `Court ${game.courtIndex + 1}: enter score` : undefined"
    @click="onCardClick"
    @keydown.enter="onCardClick"
  >
    <div class="flex items-center justify-between gap-2 px-4 pt-3" :class="showMenu ? 'pb-0' : 'pb-1'">
      <span class="eyebrow text-ink-faint">
        Court {{ game.courtIndex + 1 }}
      </span>
      <span class="flex items-center gap-1">
        <span v-if="saving" class="flex items-center gap-1 text-xs text-accent-text" aria-live="polite">
          <Loader2 class="size-3.5 animate-spin" aria-hidden="true" /> Saving
        </span>
        <span v-else-if="saved" class="flex items-center gap-1 text-xs text-win" aria-live="polite">
          <Check class="size-3.5" aria-hidden="true" /> Saved
        </span>
        <IconButton v-if="showMenu" label="Game options" @click.stop="emit('menu')">
          <MoreVertical class="size-5" />
        </IconButton>
      </span>
    </div>

    <div class="flex flex-col divide-y divide-line/60 px-4 pb-3" :class="showMenu ? '' : 'pt-1'">
      <div
        v-for="side in [1, 2] as const"
        :key="side"
        class="flex items-center justify-between gap-3 py-2.5"
        :class="teamClasses(side)"
      >
        <div class="min-w-0 flex-1">
          <p
            v-for="p in side === 1 ? game.team1 : game.team2"
            :key="p.id"
            class="truncate text-sm font-medium"
          >
            {{ p.displayName }}
          </p>
          <p class="mt-0.5 font-mono text-[0.6875rem] tabular-nums text-ink-faint">
            ELO {{ Math.round((side === 1 ? game.team1Elo : game.team2Elo) || 0) }}
          </p>
        </div>
        <span class="flex h-8 shrink-0 items-center">
          <span
            class="numeral text-2xl leading-none"
            :class="(side === 1 ? game.scoreTeam1 : game.scoreTeam2) == null ? 'text-ink-faint' : ''"
          >
            {{ (side === 1 ? game.scoreTeam1 : game.scoreTeam2) ?? '–' }}
          </span>
        </span>
      </div>
    </div>

    <p v-if="interactive && !hasResult" class="px-4 pb-2.5 text-xs text-ink-faint">
      Tap to enter score
    </p>
  </article>
</template>
