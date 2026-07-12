<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import type { GameDto } from '@/app/core/models/dto'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import CourtLines from '@/app/core/ui/components/CourtLines.vue'

const props = withDefaults(
  defineProps<{
    game: GameDto
    saving?: boolean
    saved?: boolean
    /** Tap opens the score pad, long-press the game menu. */
    interactive?: boolean
  }>(),
  { saving: false, saved: false, interactive: false }
)

const emit = defineEmits<{ open: []; menu: [] }>()

type Side = 1 | 2

const LONG_PRESS_MS = 600
const MOVE_CANCEL_PX = 10

let pressTimer: number | undefined
let startX = 0
let startY = 0
let pressing = false
let longPressed = false
let moved = false

function clearPressTimer() {
  if (pressTimer !== undefined) {
    clearTimeout(pressTimer)
    pressTimer = undefined
  }
}

function onPointerDown(e: PointerEvent) {
  // Primary button / touch only — right-click must not arm tap or long-press
  if (!props.interactive || e.button !== 0) return
  pressing = true
  longPressed = false
  moved = false
  startX = e.clientX
  startY = e.clientY
  clearPressTimer()
  pressTimer = window.setTimeout(() => {
    pressTimer = undefined
    longPressed = true
    emit('menu')
  }, LONG_PRESS_MS)
}

function onPointerMove(e: PointerEvent) {
  if (!props.interactive) return
  if (Math.abs(e.clientX - startX) > MOVE_CANCEL_PX || Math.abs(e.clientY - startY) > MOVE_CANCEL_PX) {
    moved = true
    clearPressTimer()
  }
}

function onPointerUp() {
  if (!props.interactive || !pressing) return
  const wasLongPress = longPressed
  pressing = false
  longPressed = false
  clearPressTimer()
  if (!wasLongPress && !moved) emit('open')
}

function onPointerCancel() {
  clearPressTimer()
  pressing = false
  longPressed = false
  moved = false
}

function onKeydownEnter() {
  if (props.interactive) emit('open')
}

function score(side: Side) {
  return side === 1 ? props.game.scoreTeam1 : props.game.scoreTeam2
}

function scoreClasses(side: Side) {
  if (score(side) == null) return 'text-ink-faint'
  const { result } = props.game
  if (result === 'TIE') return 'text-tie'
  if (result === 'TEAM1_WIN') return side === 1 ? 'text-accent-text' : 'text-ink-muted'
  if (result === 'TEAM2_WIN') return side === 2 ? 'text-accent-text' : 'text-ink-muted'
  return 'text-ink'
}

const ariaLabel = computed(() => {
  const base = `Court ${props.game.courtIndex + 1}`
  return props.interactive ? `${base}: tap to enter score, long-press for options` : base
})
</script>

<template>
  <article
    class="relative select-none overflow-hidden rounded-[20px] border border-line-strong bg-surface-1 ticket-clip [-webkit-touch-callout:none]"
    :class="interactive ? 'cursor-pointer' : ''"
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive ? 0 : undefined"
    :aria-label="ariaLabel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @pointerleave="onPointerCancel"
    @contextmenu.prevent
    @keydown.enter="onKeydownEnter"
  >
    <!-- Court watermark -->
    <div class="pointer-events-none absolute inset-y-0 right-0 flex w-40 items-center justify-end" aria-hidden="true">
      <CourtLines crop="half" class="h-full w-full" />
    </div>

    <div class="relative flex items-center justify-between gap-2 px-4 pt-3">
      <TapeChip variant="muted">Court {{ game.courtIndex + 1 }}</TapeChip>
      <span class="flex h-5 items-center" aria-live="polite">
        <Loader2 v-if="saving" class="size-4 animate-spin text-accent-text" aria-hidden="true" />
      </span>
    </div>

    <div class="relative flex flex-col px-4 pb-4 pt-1">
      <div v-for="side in [1, 2] as const" :key="side" class="contents">
        <div v-if="side === 2" class="kitchen-line my-1" aria-hidden="true" />
        <div class="flex items-center justify-between gap-3 py-2">
          <div class="min-w-0 flex-1">
            <p
              v-for="p in side === 1 ? game.team1 : game.team2"
              :key="p.id"
              class="truncate text-base font-semibold text-ink"
            >
              {{ p.displayName }}
            </p>
          </div>
          <!-- Fixed-height skewed score plate; digits un-skew inside -->
          <div class="flex h-16 w-20 shrink-0 -skew-x-6 items-center justify-center rounded-[8px] bg-surface-2/70">
            <span class="skew-x-6 numeral text-6xl leading-none" :class="scoreClasses(side)">
              {{ score(side) ?? '–' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Saved flash: brief volt underline draw -->
    <div v-if="saved" class="saved-underline absolute inset-x-4 bottom-1.5 h-0.5 rounded-full bg-accent-fill" aria-hidden="true" />
  </article>
</template>

<!-- Tiny keyframe Tailwind can't express: the saved underline draw. -->
<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .saved-underline {
    transform-origin: left center;
    animation: court-card-underline-draw 0.4s var(--ease-out) both;
  }
  @keyframes court-card-underline-draw {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }
}
</style>
