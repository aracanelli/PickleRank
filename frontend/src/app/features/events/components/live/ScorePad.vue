<script setup lang="ts">
import { ref, watch } from 'vue'
import { Check, ChevronRight, Loader2, Minus, Plus } from 'lucide-vue-next'
import type { GameDto } from '@/app/core/models/dto'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'

const props = withDefaults(
  defineProps<{
    game: GameDto | null
    saving?: boolean
    saved?: boolean
  }>(),
  { saving: false, saved: false }
)

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  /** Key tap / stepper — debounced autosave. */
  change: [gameId: string, score1: number, score2: number]
  /** Close / next game — immediate save. */
  commit: [gameId: string, score1: number, score2: number]
  next: []
}>()

type Side = 1 | 2

const score1 = ref(0)
const score2 = ref(0)
const activeSide = ref<Side>(1)
// Only persist if the user actually changed something — opening and closing
// an unscored game must NOT record a 0–0 result (same rule as ScoreSheet).
const touched = ref(false)

// The 0–15 quick grid
const QUICK_KEYS = Array.from({ length: 16 }, (_, n) => n)
const MAX_SCORE = 99

function syncFromGame() {
  score1.value = props.game?.scoreTeam1 ?? 0
  score2.value = props.game?.scoreTeam2 ?? 0
  activeSide.value = 1
  touched.value = false
}

watch(() => props.game?.id, syncFromGame, { immediate: true })
watch(open, (isOpen) => {
  if (isOpen) syncFromGame()
  else commitIfTouched()
})

function scoreOf(side: Side) {
  return side === 1 ? score1.value : score2.value
}

function emitChange() {
  if (!props.game) return
  touched.value = true
  emit('change', props.game.id, score1.value, score2.value)
}

function setActiveScore(value: number) {
  if (activeSide.value === 1) score1.value = value
  else score2.value = value
  emitChange()
}

function step(side: Side, delta: number) {
  activeSide.value = side
  const current = scoreOf(side)
  const next = Math.min(Math.max(current + delta, 0), MAX_SCORE)
  if (next === current) return
  if (side === 1) score1.value = next
  else score2.value = next
  emitChange()
}

function commitIfTouched() {
  if (!props.game || !touched.value) return
  emit('commit', props.game.id, score1.value, score2.value)
  touched.value = false
}

function onNext() {
  commitIfTouched()
  emit('next')
}

function scoreClasses(side: Side) {
  const s1 = score1.value
  const s2 = score2.value
  if (s1 === s2) return 'text-ink'
  const winner: Side = s1 > s2 ? 1 : 2
  return side === winner ? 'text-accent-text' : 'text-ink-muted'
}
</script>

<template>
  <Sheet v-model="open" :title="game ? `Court ${game.courtIndex + 1} · Round ${game.roundIndex + 1}` : ''">
    <div v-if="game" class="flex flex-col gap-4 py-1">
      <!-- Team columns: tap to pick which score the quick grid sets -->
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="side in [1, 2] as const"
          :key="side"
          role="button"
          :tabindex="0"
          class="flex cursor-pointer flex-col items-center gap-1 rounded-[14px] border p-3 transition-colors"
          :class="
            activeSide === side
              ? 'border-transparent bg-surface-2 ring-2 ring-accent-fill'
              : 'border-line bg-surface-2/50'
          "
          :aria-pressed="activeSide === side"
          :aria-label="`Score for ${(side === 1 ? game.team1 : game.team2).map((p) => p.displayName).join(' and ')}`"
          @click="activeSide = side"
          @keydown.enter="activeSide = side"
        >
          <p
            v-for="p in side === 1 ? game.team1 : game.team2"
            :key="p.id"
            class="w-full truncate text-center text-sm font-semibold text-ink"
          >
            {{ p.displayName }}
          </p>
          <span class="flex h-14 items-center">
            <span class="numeral text-5xl leading-none" :class="scoreClasses(side)">{{ scoreOf(side) }}</span>
          </span>
          <!-- +/- steppers for scores past the quick grid -->
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border border-line-strong text-ink-muted transition-colors hover:text-ink active:scale-95 disabled:pointer-events-none disabled:opacity-30"
              :disabled="scoreOf(side) <= 0"
              :aria-label="`Decrease team ${side} score`"
              @click.stop="step(side, -1)"
            >
              <Minus class="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border border-line-strong text-ink-muted transition-colors hover:text-ink active:scale-95 disabled:pointer-events-none disabled:opacity-30"
              :disabled="scoreOf(side) >= MAX_SCORE"
              :aria-label="`Increase team ${side} score`"
              @click.stop="step(side, 1)"
            >
              <Plus class="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <!-- Shared 0–15 quick grid: sets the active team's score -->
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="n in QUICK_KEYS"
          :key="n"
          type="button"
          class="min-h-12 rounded-[10px] numeral text-xl transition-colors"
          :class="
            scoreOf(activeSide) === n
              ? 'bg-accent-fill text-accent-contrast'
              : 'bg-surface-2 text-ink hover:bg-surface-3 active:bg-accent-fill active:text-accent-contrast'
          "
          :aria-label="`Set score to ${n}`"
          @click="setActiveScore(n)"
        >
          {{ n }}
        </button>
      </div>

      <p class="min-h-5 text-center text-xs" aria-live="polite">
        <span v-if="saving" class="inline-flex items-center gap-1 text-accent-text">
          <Loader2 class="size-3.5 animate-spin" aria-hidden="true" /> Saving…
        </span>
        <span v-else-if="saved" class="inline-flex items-center gap-1 text-win">
          <Check class="size-3.5" aria-hidden="true" /> Saved
        </span>
        <span v-else class="text-ink-faint">Scores save automatically · ties are allowed</span>
      </p>
    </div>

    <template #footer>
      <AppButton block @click="onNext">
        Next game
        <ChevronRight class="size-4" aria-hidden="true" />
      </AppButton>
    </template>
  </Sheet>
</template>
