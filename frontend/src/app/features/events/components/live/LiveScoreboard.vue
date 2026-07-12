<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { EventDto, GameDto } from '@/app/core/models/dto'
import { usePrefersReducedMotion } from '@/app/core/ui/composables/usePrefersReducedMotion'
import { useWakeLock } from '@/app/core/ui/composables/useWakeLock'
import ScoreboardTopBar from './ScoreboardTopBar.vue'
import CourtCard from './CourtCard.vue'
import ScorePad from './ScorePad.vue'
import ProgressRail from './ProgressRail.vue'

const props = defineProps<{
  event: EventDto
  gamesByRound: GameDto[][]
  savingGameIds: Set<string>
  savedGameIds: Set<string>
  canManage: boolean
  completing: boolean
}>()

const emit = defineEmits<{
  /** Score edits: change = debounced autosave, commit = immediate save. */
  change: [gameId: string, score1: number, score2: number]
  commit: [gameId: string, score1: number, score2: number]
  /** Long-press: open the per-game actions sheet (reteam / delete game). */
  menu: [game: GameDto]
  swap: []
  complete: []
  exit: []
}>()

/** Selected round — owned by EventDetailPage so it survives exiting live mode. */
const round = defineModel<number>('round', { required: true })
/** Which game the score pad is open for — the page uses this to guard poll merges. */
const scorePadGameId = defineModel<string | null>('scorePadGameId', { default: null })

const prefersReducedMotion = usePrefersReducedMotion()

// Keep the screen awake while the scoreboard is up
const wakeLock = useWakeLock()
onMounted(() => {
  void wakeLock.request()
})

const isCompleted = computed(() => props.event.status === 'COMPLETED')
const interactive = computed(() => props.canManage && !isCompleted.value)

const isScored = (g: GameDto) => g.scoreTeam1 != null && g.scoreTeam2 != null
const roundScored = computed(() => props.gamesByRound.map((games) => games.length > 0 && games.every(isScored)))
const scoredCount = computed(() => props.event.games.filter(isScored).length)
const allScoresEntered = computed(
  () => props.event.games.length > 0 && props.event.games.every(isScored)
)

// ---------------------------------------------------------------------------
// Round pager: CSS scroll-snap synced to `round` via a rAF-throttled listener
const pagerRef = ref<HTMLElement | null>(null)
let scrollRafId = 0

function onPagerScroll() {
  if (scrollRafId) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = 0
    const el = pagerRef.value
    if (!el || el.clientWidth === 0) return
    const idx = Math.min(
      Math.max(Math.round(el.scrollLeft / el.clientWidth), 0),
      props.gamesByRound.length - 1
    )
    if (idx !== round.value) round.value = idx
  })
}

function scrollToRound(index: number, behavior: 'auto' | 'smooth' = 'smooth') {
  round.value = index
  const el = pagerRef.value
  if (!el) return
  el.scrollTo({
    left: index * el.clientWidth,
    behavior: prefersReducedMotion.value ? 'auto' : behavior
  })
}

onMounted(async () => {
  await nextTick()
  // Land on the round selected in the console view, without animation
  scrollToRound(Math.min(round.value, Math.max(props.gamesByRound.length - 1, 0)), 'auto')
})

onBeforeUnmount(() => {
  if (scrollRafId) cancelAnimationFrame(scrollRafId)
})

// ---------------------------------------------------------------------------
// Score pad
const padGameId = ref<string | null>(null)
const padOpen = ref(false)

// The page needs "pad open for game X" to skip poll-merging that game
watch([padOpen, padGameId], ([open, id]) => {
  scorePadGameId.value = open ? id : null
})

const padGame = computed(() => props.event.games.find((g) => g.id === padGameId.value) ?? null)

function openPad(game: GameDto) {
  if (!interactive.value) return
  padGameId.value = game.id
  padOpen.value = true
}

/** "Next game": next unscored game in this round, wrapping into later rounds. */
function goToNextGame() {
  const currentId = padGameId.value
  if (!currentId) return
  const ordered = [...props.event.games].sort(
    (a, b) => a.roundIndex - b.roundIndex || a.courtIndex - b.courtIndex
  )
  const idx = ordered.findIndex((g) => g.id === currentId)
  for (let step = 1; step <= ordered.length; step++) {
    const candidate = ordered[(idx + step) % ordered.length]
    if (candidate.id !== currentId && !isScored(candidate)) {
      padGameId.value = candidate.id
      if (candidate.roundIndex !== round.value) scrollToRound(candidate.roundIndex)
      return
    }
  }
  padOpen.value = false
}
</script>

<template>
  <div class="flex h-dvh min-h-dvh flex-col pt-safe pb-safe">
    <ScoreboardTopBar
      :event-name="event.name || 'Event'"
      :rounds="gamesByRound.length"
      :current-round="round"
      :round-scored="roundScored"
      :live="event.status === 'IN_PROGRESS'"
      :can-swap="interactive"
      @exit="emit('exit')"
      @select="scrollToRound"
      @swap="emit('swap')"
    />

    <!-- Horizontally snapping round pager -->
    <div
      ref="pagerRef"
      class="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      @scroll.passive="onPagerScroll"
    >
      <section
        v-for="(games, i) in gamesByRound"
        :key="i"
        class="h-full w-full shrink-0 snap-center overflow-y-auto px-4 pb-44 pt-1 md:px-6"
        :aria-label="`Round ${i + 1}`"
      >
        <div class="mx-auto w-full max-w-xl md:max-w-5xl">
          <p class="eyebrow mb-2 px-1 text-ink-faint">
            Round <span class="text-ink">{{ i + 1 }}</span> / {{ gamesByRound.length }}
          </p>
          <div class="flex flex-col gap-3 md:grid md:grid-cols-2 lg:grid-cols-3">
            <CourtCard
              v-for="game in games"
              :key="game.id"
              :game="game"
              :saving="savingGameIds.has(game.id)"
              :saved="savedGameIds.has(game.id)"
              :interactive="interactive"
              @open="openPad(game)"
              @menu="emit('menu', game)"
            />
          </div>
          <p v-if="games.length === 0" class="py-10 text-center text-sm text-ink-faint">
            No games in this round
          </p>
        </div>
      </section>
    </div>

    <ProgressRail
      :scored="scoredCount"
      :total="event.games.length"
      :all-scores-entered="allScoresEntered"
      :can-manage="canManage"
      :completed="isCompleted"
      :completing="completing"
      @complete="emit('complete')"
    />

    <ScorePad
      v-model="padOpen"
      :game="padGame"
      :saving="!!padGame && savingGameIds.has(padGame.id)"
      :saved="!!padGame && savedGameIds.has(padGame.id)"
      @change="(id, s1, s2) => emit('change', id, s1, s2)"
      @commit="(id, s1, s2) => emit('commit', id, s1, s2)"
      @next="goToNextGame"
    />
  </div>
</template>
