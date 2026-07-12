<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import html2canvas from 'html2canvas'
import { MoreVertical, Pencil, RefreshCw, Download, Trash2, Sparkles, ArrowLeftRight, Users2, MonitorPlay } from 'lucide-vue-next'
import { eventsApi } from '../services/events.api'
import type { EventDto, EventStatus, GameDto, RatingUpdateDto, PlayerInfo } from '@/app/core/models/dto'
import { useGroupContextStore } from '@/stores/group-context'
import { useToast } from '@/app/core/ui/composables/useToast'
import { useConfirm } from '@/app/core/ui/composables/useConfirm'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import { useScoreAutosave } from '../composables/useScoreAutosave'
import { useCelebration } from '../composables/useCelebration'
import { bustGroupHistory } from '@/app/features/rankings/composables/useGroupHistory'
import HeaderActions from '@/app/core/layout/HeaderActions.vue'
import IconButton from '@/app/core/ui/components/IconButton.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import LiveDot from '@/app/core/ui/components/LiveDot.vue'
import CourtLines from '@/app/core/ui/components/CourtLines.vue'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import ShareableSchedule from '../components/ShareableSchedule.vue'
import GenerationPreview from '../components/GenerationPreview.vue'
import GenerationMetaChips from '../components/GenerationMetaChips.vue'
import RoundPicker from '../components/RoundPicker.vue'
import GameCard from '../components/GameCard.vue'
import ScoreSheet from '../components/ScoreSheet.vue'
import SwapPlayersSheet from '../components/SwapPlayersSheet.vue'
import ReteamSheet from '../components/ReteamSheet.vue'
import RatingRevealSheet from '../components/RatingRevealSheet.vue'
import LiveScoreboard from '../components/live/LiveScoreboard.vue'

const router = useRouter()
const route = useRoute()
const groupContext = useGroupContextStore()
const toast = useToast()
const { confirm } = useConfirm()

const eventId = computed(() => route.params.eventId as string)

const event = ref<EventDto | null>(null)
const isLoading = ref(true)
const loadError = ref('')
const isGenerating = ref(false)
const isCompleting = ref(false)
const isExporting = ref(false)
const showPreview = ref(false)

const selectedRoundKey = ref('0')
const ratingUpdates = ref<RatingUpdateDto[]>([])

// Sheets
const actionsOpen = ref(false)
const scoreSheetOpen = ref(false)
const scoreGameId = ref<string | null>(null)
const gameMenuOpen = ref(false)
const menuGameId = ref<string | null>(null)
const swapSheetOpen = ref(false)
const reteamSheetOpen = ref(false)
const reteamGameId = ref<string | null>(null)
const resultsSheetOpen = ref(false)

// Name editing (optimistic save, ported from legacy)
const isEditingName = ref(false)
const tempEventName = ref('')

// Export (off-screen ShareableSchedule render)
const shareableRef = ref<HTMLElement | null>(null)

const { savingGameIds, savedGameIds, debouncedSave, saveNow } = useScoreAutosave(event, {
  onError: (message) => toast.error(message),
  reload: () => loadEvent(true)
})

// Completion celebration (confetti + "EVENT COMPLETE" flash)
const { flashVisible, celebrate, skip: skipFlash, prefersReducedMotion } = useCelebration()

// ---------------------------------------------------------------------------
// Live mode (immersive scoreboard) — fully query-driven so back/refresh work.
// The app shell hides its chrome and swaps the page bg when ?mode=live.
const isLive = computed(() => route.query.mode === 'live')

function enterLive() {
  router.replace({ query: { ...route.query, mode: 'live' } })
}

function exitLive() {
  const query = { ...route.query }
  delete query.mode
  router.replace({ query })
}

// The live pager and the console RoundPicker share one selected round, owned
// here, so exiting live mode lands on the same round.
const liveRound = computed({
  get: () => Number(selectedRoundKey.value) || 0,
  set: (value: number) => {
    selectedRoundKey.value = String(value)
  }
})

// Which game the live ScorePad is currently open for (merge guard)
const liveScorePadGameId = ref<string | null>(null)

onMounted(() => loadEvent())

async function loadEvent(silent = false) {
  if (!silent) isLoading.value = true
  loadError.value = ''
  try {
    event.value = await eventsApi.get(eventId.value)
    // Group context: only the groupId is known here (name/role stay as-is)
    groupContext.setGroup({ groupId: event.value.groupId })
    // Show preview when games are generated but not yet accepted; silent
    // reloads (autosave recovery, swaps) must not bounce back into preview,
    // and neither should landing straight on the live scoreboard.
    if (!silent && !isLive.value && event.value.status === 'GENERATED' && event.value.games.length > 0) {
      showPreview.value = true
    }
    if (Number(selectedRoundKey.value) >= event.value.rounds) selectedRoundKey.value = '0'
    // ?mode=live is meaningless without a schedule (e.g. hand-edited URL on a
    // draft): drop it so the user isn't left on a chromeless console view.
    if (isLive.value && event.value.games.length === 0) exitLive()
  } catch (e) {
    loadError.value = getApiErrorMessage(e, 'Failed to load event')
  } finally {
    isLoading.value = false
  }
}

// ---------------------------------------------------------------------------
// Permissions: default to showing controls when the role is unknown (direct
// navigation) and let the API enforce; hide only for explicit PLAYER role.
const canManage = computed(() => groupContext.role === null || groupContext.canManage)

const isCompleted = computed(() => event.value?.status === 'COMPLETED')

const gamesByRound = computed(() => {
  if (!event.value) return []
  const rounds: GameDto[][] = []
  for (let i = 0; i < event.value.rounds; i++) {
    rounds.push(event.value.games.filter((g) => g.roundIndex === i))
  }
  return rounds
})

const hasEnteredScores = computed(
  () => event.value?.games.some((g) => g.scoreTeam1 != null || g.scoreTeam2 != null) ?? false
)
const allScoresEntered = computed(
  () => event.value?.games.every((g) => g.scoreTeam1 != null && g.scoreTeam2 != null) ?? false
)
const scoredCount = computed(
  () => event.value?.games.filter((g) => g.scoreTeam1 != null && g.scoreTeam2 != null).length ?? 0
)

const selectedRound = computed(() => Number(selectedRoundKey.value))
const selectedRoundGames = computed(() => gamesByRound.value[selectedRound.value] ?? [])

const roundOptions = computed(() =>
  gamesByRound.value.map((games, i) => ({
    label: `R${i + 1}`,
    value: String(i),
    dot: games.length > 0 && games.every((g) => g.scoreTeam1 != null && g.scoreTeam2 != null)
  }))
)

const allEventPlayers = computed<PlayerInfo[]>(() => {
  const seen = new Map<string, PlayerInfo>()
  for (const game of event.value?.games ?? []) {
    for (const p of [...game.team1, ...game.team2]) {
      if (!seen.has(p.id)) seen.set(p.id, p)
    }
  }
  return [...seen.values()]
})

const statusMeta = computed(() => {
  switch (event.value?.status) {
    case 'GENERATED': return { label: 'Generated', variant: 'info' as const }
    case 'IN_PROGRESS': return { label: 'Live', variant: 'live' as const }
    case 'COMPLETED': return { label: 'Final', variant: 'win' as const }
    default: return { label: 'Draft', variant: 'muted' as const }
  }
})

// Overflow menu availability
const canRegenerate = computed(
  () => canManage.value && !!event.value && !isCompleted.value && (!hasEnteredScores.value || showPreview.value)
)
const canExport = computed(() => (event.value?.games.length ?? 0) > 0)
const canDelete = computed(() => canManage.value && !!event.value && !isCompleted.value)
const hasHeaderActions = computed(() => canRegenerate.value || canExport.value || canDelete.value)

const showCompleteBar = computed(
  () =>
    canManage.value &&
    !!event.value &&
    !showPreview.value &&
    event.value.games.length > 0 &&
    (event.value.status === 'GENERATED' || event.value.status === 'IN_PROGRESS')
)

// The signature CTA: shown whenever a schedule exists and scoring is possible
const showEnterScoreboard = computed(
  () =>
    !!event.value &&
    !showPreview.value &&
    event.value.games.length > 0 &&
    (event.value.status === 'GENERATED' || event.value.status === 'IN_PROGRESS')
)

const showLiveScoreboard = computed(() => isLive.value && !!event.value && event.value.games.length > 0)

// ---------------------------------------------------------------------------
// Score edits: every local edit is timestamped so the live poll never merges
// a game the scorer just touched (the autosave composable is frozen and does
// not expose its pending/queued maps).
const lastLocalEditAt = new Map<string, number>()

function onScoreChange(gameId: string, score1?: number, score2?: number) {
  lastLocalEditAt.set(gameId, Date.now())
  debouncedSave(gameId, score1, score2)
}

function onScoreCommit(gameId: string, score1?: number, score2?: number) {
  lastLocalEditAt.set(gameId, Date.now())
  void saveNow(gameId, score1, score2)
}

// ---------------------------------------------------------------------------
// Live poll: every 15s while the scoreboard is visible, pull the event and
// merge in other scorers' games — never clobbering local, in-flight edits.
const POLL_INTERVAL_MS = 15_000
const LOCAL_EDIT_GRACE_MS = 10_000
let pollTimerId: number | undefined
let pollInFlight = false

function isGameDirty(gameId: string, now: number) {
  // In-flight save
  if (savingGameIds.value.has(gameId)) return true
  // Debounced/queued save may still be pending — treat anything edited
  // recently as dirty
  const editedAt = lastLocalEditAt.get(gameId)
  if (editedAt !== undefined && now - editedAt < LOCAL_EDIT_GRACE_MS) return true
  // Never merge under an open score pad / score sheet for that game
  if (liveScorePadGameId.value === gameId) return true
  if (scoreSheetOpen.value && scoreGameId.value === gameId) return true
  return false
}

async function pollTick() {
  if (pollInFlight) return
  if (document.visibilityState !== 'visible') return
  if (!event.value || event.value.status === 'COMPLETED') return
  pollInFlight = true
  try {
    const fresh = await eventsApi.get(eventId.value)
    if (!isLive.value || !event.value || fresh.id !== event.value.id) return
    const now = Date.now()
    const localById = new Map(event.value.games.map((g) => [g.id, g]))
    const mergedGames = fresh.games.map((g) =>
      isGameDirty(g.id, now) ? (localById.get(g.id) ?? g) : g
    )
    // Status only moves forward — a stale server read must not undo the
    // optimistic GENERATED → IN_PROGRESS transition
    const rank: Record<EventStatus, number> = { DRAFT: 0, GENERATED: 1, IN_PROGRESS: 2, COMPLETED: 3 }
    const status = rank[fresh.status] > rank[event.value.status] ? fresh.status : event.value.status
    event.value = { ...event.value, status, generationMeta: fresh.generationMeta, games: mergedGames }
  } catch {
    // Transient poll failure — next tick will retry
  } finally {
    pollInFlight = false
  }
}

function startPolling() {
  if (pollTimerId !== undefined) return
  pollTimerId = window.setInterval(() => void pollTick(), POLL_INTERVAL_MS)
}

function stopPolling() {
  if (pollTimerId !== undefined) {
    clearInterval(pollTimerId)
    pollTimerId = undefined
  }
}

watch(isLive, (live) => (live ? startPolling() : stopPolling()), { immediate: true })
onUnmounted(stopPolling)

// ---------------------------------------------------------------------------
// Generation
async function generateSchedule(newSeed = false) {
  if (!event.value) return
  if (event.value.games.length > 0) {
    const ok = await confirm({
      title: 'Regenerate schedule?',
      message: 'This will delete the current schedule and any entered scores.',
      confirmLabel: 'Regenerate',
      danger: true
    })
    if (!ok) return
  }
  isGenerating.value = true
  try {
    const result = await eventsApi.generate(eventId.value, newSeed)
    event.value = { ...event.value, status: result.status, generationMeta: result.generationMeta, games: result.games }
    showPreview.value = true
    selectedRoundKey.value = '0'
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to generate schedule'))
  } finally {
    isGenerating.value = false
  }
}

function acceptPreview() {
  showPreview.value = false
}

// ---------------------------------------------------------------------------
// Name editing
function startEditName() {
  if (!event.value) return
  tempEventName.value = event.value.name || ''
  isEditingName.value = true
  nextTick(() => {
    document.querySelector<HTMLInputElement>('#event-name-edit input')?.focus()
  })
}

function cancelEditName() {
  isEditingName.value = false
  tempEventName.value = ''
}

async function saveName() {
  if (!event.value || !isEditingName.value) return
  const newName = tempEventName.value.trim()
  if (!newName || newName === event.value.name) {
    cancelEditName()
    return
  }
  // Optimistic update, revert on failure (ported)
  const oldName = event.value.name
  event.value.name = newName
  isEditingName.value = false
  try {
    await eventsApi.update(event.value.id, { name: newName })
  } catch (e) {
    event.value.name = oldName
    toast.error(getApiErrorMessage(e, 'Failed to update name'))
  }
}

// ---------------------------------------------------------------------------
// Scoring (console quick-edit path)
function openScoreSheet(game: GameDto) {
  if (!canManage.value || isCompleted.value) return
  scoreGameId.value = game.id
  scoreSheetOpen.value = true
}

const scoreGame = computed(() => event.value?.games.find((g) => g.id === scoreGameId.value) ?? null)

function goToNextGame() {
  if (!event.value || !scoreGameId.value) return
  const currentId = scoreGameId.value
  const isUnscored = (g: GameDto) => g.scoreTeam1 == null || g.scoreTeam2 == null
  const ordered = [...event.value.games].sort(
    (a, b) => a.roundIndex - b.roundIndex || a.courtIndex - b.courtIndex
  )
  const idx = ordered.findIndex((g) => g.id === currentId)
  for (let step = 1; step <= ordered.length; step++) {
    const candidate = ordered[(idx + step) % ordered.length]
    if (candidate.id !== currentId && isUnscored(candidate)) {
      scoreGameId.value = candidate.id
      selectedRoundKey.value = String(candidate.roundIndex)
      return
    }
  }
  scoreSheetOpen.value = false
}

// ---------------------------------------------------------------------------
// Per-game menu / reteam / delete game (shared by console and live long-press)
const menuGame = computed(() => event.value?.games.find((g) => g.id === menuGameId.value) ?? null)
const reteamGame = computed(() => event.value?.games.find((g) => g.id === reteamGameId.value) ?? null)

function openGameMenu(game: GameDto) {
  menuGameId.value = game.id
  gameMenuOpen.value = true
}

function openReteam() {
  reteamGameId.value = menuGameId.value
  gameMenuOpen.value = false
  reteamSheetOpen.value = true
}

async function deleteGame() {
  const game = menuGame.value
  gameMenuOpen.value = false
  if (!game) return
  const ok = await confirm({
    title: 'Delete game?',
    message: `Delete the Court ${game.courtIndex + 1} game in Round ${game.roundIndex + 1}? This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return
  try {
    await eventsApi.deleteGame(game.id)
    toast.success('Game deleted')
    await loadEvent(true)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to delete game'))
  }
}

// ---------------------------------------------------------------------------
// Complete / delete event
async function completeEvent() {
  if (!event.value) return
  const ok = await confirm({
    title: 'Complete event?',
    message: 'Complete this event and update ratings?',
    confirmLabel: 'Complete'
  })
  if (!ok) return
  isCompleting.value = true
  try {
    const result = await eventsApi.complete(eventId.value, event.value.groupId)
    event.value = { ...event.value, status: result.status }
    ratingUpdates.value = result.ratingUpdates
    bustGroupHistory(event.value.groupId)
    // Celebration first (confetti + flash, tap to skip), then the reveal
    await celebrate()
    resultsSheetOpen.value = true
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to complete event'))
  } finally {
    isCompleting.value = false
  }
}

async function deleteEvent() {
  if (!event.value) return
  actionsOpen.value = false
  const ok = await confirm({
    title: 'Delete event?',
    message: `Delete event "${event.value.name || 'Unnamed event'}"? This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return
  const groupId = event.value.groupId
  try {
    await eventsApi.delete(eventId.value)
    toast.success('Event deleted')
    router.push(`/groups/${groupId}`)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to delete event'))
  }
}

function regenerateFromMenu() {
  actionsOpen.value = false
  generateSchedule(true)
}

function exportFromMenu() {
  actionsOpen.value = false
  exportAsImage()
}

// ---------------------------------------------------------------------------
// Export as image (ported verbatim: html2canvas + Web Share API + iOS fallback)
async function exportAsImage() {
  if (!shareableRef.value) return

  isExporting.value = true
  try {
    const wrapper = shareableRef.value
    const scheduleEl = wrapper.firstElementChild as HTMLElement

    const canvas = await html2canvas(scheduleEl || wrapper, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
      width: (scheduleEl || wrapper).scrollWidth,
      height: (scheduleEl || wrapper).scrollHeight
    })

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })

    if (!blob) return

    const fileName = `${event.value?.name || 'schedule'}-games.png`

    // Check if Web Share API is available (best for mobile)
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], fileName, { type: 'image/png' })
      const shareData = { files: [file] }

      if (navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData)
          return
        } catch (shareError) {
          // User cancelled or share failed, fall through to other methods
          if ((shareError as Error).name !== 'AbortError') {
            console.log('Share failed, trying fallback...')
          }
        }
      }
    }

    // Check if iOS (for long-press save fallback)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const url = URL.createObjectURL(blob)

    if (isIOS) {
      // Open image in new window - user can long-press to save
      window.open(url, '_blank')
      // Revoke after a delay to allow the new window to load
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } else {
      // Standard download for desktop
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  } catch (e) {
    console.error('Failed to export image:', e)
    toast.error('Failed to export image')
  } finally {
    isExporting.value = false
  }
}

// Keep the route-driven page usable when the id changes in place
watch(eventId, () => loadEvent())
</script>

<template>
  <!-- Header is hidden while immersive; don't teleport into it -->
  <HeaderActions v-if="!isLive">
    <IconButton v-if="event && hasHeaderActions" label="Event actions" @click="actionsOpen = true">
      <MoreVertical class="size-5" />
    </IconButton>
  </HeaderActions>

  <!-- ======================== LIVE SCOREBOARD ======================== -->
  <LiveScoreboard
    v-if="showLiveScoreboard && event"
    v-model:round="liveRound"
    v-model:score-pad-game-id="liveScorePadGameId"
    :event="event"
    :games-by-round="gamesByRound"
    :saving-game-ids="savingGameIds"
    :saved-game-ids="savedGameIds"
    :can-manage="canManage"
    :completing="isCompleting"
    @change="onScoreChange"
    @commit="onScoreCommit"
    @menu="openGameMenu"
    @swap="swapSheetOpen = true"
    @complete="completeEvent"
    @exit="exitLive"
  />

  <!-- ======================== CONSOLE VIEW ======================== -->
  <div v-else class="mx-auto w-full max-w-5xl px-4 py-5 md:px-6" :class="showCompleteBar ? 'pb-28' : ''">
    <SkeletonList v-if="isLoading" :rows="5" />

    <ErrorState v-else-if="loadError" :message="loadError" @retry="loadEvent()" />

    <div v-else-if="event" class="flex flex-col gap-4">
      <!-- Masthead -->
      <div class="flex flex-col gap-2">
        <AppInput
          v-if="isEditingName"
          id="event-name-edit"
          v-model="tempEventName"
          placeholder="Event name"
          @keyup.enter="saveName"
          @keyup.esc="cancelEditName"
          @focusout="saveName"
        />
        <div v-else class="flex items-center gap-1.5">
          <h1 class="display-wide min-w-0 truncate text-2xl text-ink md:text-4xl">
            {{ event.name || 'Event' }}
          </h1>
          <IconButton v-if="canManage" label="Edit name" @click="startEditName">
            <Pencil class="size-4" />
          </IconButton>
        </div>
        <div class="flex flex-wrap items-center gap-2.5">
          <TapeChip :variant="statusMeta.variant">
            <LiveDot v-if="event.status === 'IN_PROGRESS'" />
            {{ statusMeta.label }}
          </TapeChip>
          <span class="font-mono text-xs tabular-nums text-ink-muted">
            {{ event.courts }} {{ event.courts === 1 ? 'court' : 'courts' }} · {{ event.rounds }} rounds
          </span>
        </div>
        <div class="kitchen-line" aria-hidden="true" />
      </div>

      <!-- DRAFT: generate hero -->
      <div
        v-if="event.status === 'DRAFT'"
        class="relative flex flex-col items-center gap-3 overflow-hidden rounded-[20px] border border-line-strong bg-surface-court px-6 py-12 text-center ticket-clip stadium-glow"
      >
        <div class="absolute inset-0" aria-hidden="true">
          <CourtLines crop="full" class="h-full w-full" />
        </div>
        <div class="relative flex flex-col items-center gap-3">
          <p class="eyebrow text-ink-faint">Matchday setup</p>
          <h2 class="display-wide text-xl text-ink">Ready to generate games?</h2>
          <p class="max-w-sm text-sm text-ink-muted">
            Build the match schedule for {{ event.participantCount }} players across
            {{ event.courts }} {{ event.courts === 1 ? 'court' : 'courts' }}.
          </p>
          <AppButton v-if="canManage" variant="broadcast" :loading="isGenerating" class="mt-1" @click="generateSchedule(false)">
            <Sparkles class="size-4" aria-hidden="true" />
            Generate schedule
          </AppButton>
          <p v-else class="text-sm text-ink-faint">An organizer can generate the schedule.</p>
        </div>
      </div>

      <!-- Preview mode -->
      <GenerationPreview
        v-else-if="showPreview && event.games.length > 0"
        :event="event"
        :games-by-round="gamesByRound"
        :generating="isGenerating"
        @regenerate="generateSchedule(true)"
        @accept="acceptPreview"
      />

      <!-- Scoring console / completed -->
      <template v-else>
        <!-- Enter Scoreboard hero — the signature experience -->
        <div
          v-if="showEnterScoreboard"
          class="relative flex flex-col gap-3 overflow-hidden rounded-[20px] border border-line-strong bg-surface-court px-5 py-6 ticket-clip stadium-glow sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="pointer-events-none absolute inset-y-0 right-0 w-48" aria-hidden="true">
            <CourtLines crop="half" class="h-full w-full" />
          </div>
          <div class="relative min-w-0">
            <p class="eyebrow flex items-center gap-1.5 text-ink-faint">
              <LiveDot v-if="event.status === 'IN_PROGRESS'" />
              Live scoreboard
            </p>
            <p class="mt-1 text-sm text-ink-muted">
              Full-screen courtside scoring, one round per swipe.
            </p>
          </div>
          <AppButton variant="broadcast" class="relative shrink-0" @click="enterLive">
            <MonitorPlay class="size-4" aria-hidden="true" />
            Enter scoreboard
          </AppButton>
        </div>

        <GenerationMetaChips v-if="event.generationMeta" :meta="event.generationMeta" />

        <RoundPicker v-model="selectedRoundKey" :options="roundOptions">
          <AppButton
            v-if="canManage && !isCompleted"
            variant="secondary"
            size="sm"
            @click="swapSheetOpen = true"
          >
            <ArrowLeftRight class="size-4" aria-hidden="true" />
            <span class="hidden sm:inline">Swap players</span>
            <span class="sm:hidden">Swap</span>
          </AppButton>
        </RoundPicker>

        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <GameCard
            v-for="game in selectedRoundGames"
            :key="game.id"
            :game="game"
            :saving="savingGameIds.has(game.id)"
            :saved="savedGameIds.has(game.id)"
            :interactive="canManage && !isCompleted"
            :show-menu="canManage && !isCompleted"
            @open="openScoreSheet(game)"
            @menu="openGameMenu(game)"
          />
        </div>
      </template>
    </div>
  </div>

  <!-- Sticky completion bar (console; above the bottom tab bar) -->
  <div
    v-if="!isLive && showCompleteBar && event"
    class="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface-page/95 pb-safe backdrop-blur md:bottom-0"
  >
    <div class="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-6">
      <span class="eyebrow text-ink-faint">
        <span class="text-ink">{{ scoredCount }} / {{ event.games.length }}</span> scored
      </span>
      <AppButton
        :loading="isCompleting"
        :disabled="!allScoresEntered"
        :title="!allScoresEntered ? 'Enter all scores to complete' : undefined"
        @click="completeEvent"
      >
        Complete event
      </AppButton>
    </div>
  </div>

  <!-- Header overflow actions -->
  <Sheet v-model="actionsOpen" title="Event actions">
    <div class="-mx-4 flex flex-col divide-y divide-line">
      <button
        v-if="canRegenerate"
        type="button"
        class="flex min-h-14 items-center gap-3 px-4 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        @click="regenerateFromMenu"
      >
        <RefreshCw class="size-5 text-ink-muted" aria-hidden="true" />
        Regenerate schedule
        <span class="ml-auto text-xs text-ink-faint">New seed</span>
      </button>
      <button
        v-if="canExport"
        type="button"
        class="flex min-h-14 items-center gap-3 px-4 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        :disabled="isExporting"
        @click="exportFromMenu"
      >
        <Download class="size-5 text-ink-muted" aria-hidden="true" />
        {{ isExporting ? 'Exporting…' : 'Export schedule image' }}
      </button>
      <button
        v-if="canDelete"
        type="button"
        class="flex min-h-14 items-center gap-3 px-4 text-left text-sm font-medium text-loss transition-colors hover:bg-loss/10"
        @click="deleteEvent"
      >
        <Trash2 class="size-5" aria-hidden="true" />
        Delete event
      </button>
    </div>
  </Sheet>

  <!-- Per-game menu (console overflow + live long-press) -->
  <Sheet v-model="gameMenuOpen" :title="menuGame ? `Court ${menuGame.courtIndex + 1} · Round ${menuGame.roundIndex + 1}` : ''">
    <div class="-mx-4 flex flex-col divide-y divide-line">
      <button
        type="button"
        class="flex min-h-14 items-center gap-3 px-4 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        @click="openReteam"
      >
        <Users2 class="size-5 text-ink-muted" aria-hidden="true" />
        Edit teams
      </button>
      <button
        type="button"
        class="flex min-h-14 items-center gap-3 px-4 text-left text-sm font-medium text-loss transition-colors hover:bg-loss/10"
        @click="deleteGame"
      >
        <Trash2 class="size-5" aria-hidden="true" />
        Delete game
      </button>
    </div>
  </Sheet>

  <ScoreSheet
    v-model="scoreSheetOpen"
    :game="scoreGame"
    :saving="!!scoreGame && savingGameIds.has(scoreGame.id)"
    :saved="!!scoreGame && savedGameIds.has(scoreGame.id)"
    @change="onScoreChange"
    @commit="onScoreCommit"
    @next="goToNextGame"
  />

  <SwapPlayersSheet
    v-if="event"
    v-model="swapSheetOpen"
    :event-id="event.id"
    :round-index="selectedRound"
    :round-games="selectedRoundGames"
    @swapped="loadEvent(true)"
  />

  <ReteamSheet
    v-if="event"
    v-model="reteamSheetOpen"
    :game="reteamGame"
    :all-players="allEventPlayers"
    :group-id="event.groupId"
    @updated="loadEvent(true)"
  />

  <RatingRevealSheet
    v-if="event"
    v-model="resultsSheetOpen"
    :updates="ratingUpdates"
    :group-id="event.groupId"
  />

  <!-- "EVENT COMPLETE" celebration flash (tap to skip) -->
  <Teleport to="body">
    <div
      v-if="flashVisible"
      class="fixed inset-0 z-[70] flex cursor-pointer items-center justify-center bg-surface-court/95 backdrop-blur-sm"
      role="status"
      aria-label="Event complete"
      @click="skipFlash"
    >
      <p
        class="display-wide px-6 text-center text-4xl text-accent-text md:text-6xl"
        :class="prefersReducedMotion ? '' : 'celebrate-flash'"
      >
        Event complete
      </p>
    </div>
  </Teleport>

  <!-- Hidden container for image export (off-screen but renderable) -->
  <div class="pointer-events-none fixed left-[-9999px] top-0" aria-hidden="true">
    <div ref="shareableRef">
      <ShareableSchedule v-if="event" :event="event" :games-by-round="gamesByRound" />
    </div>
  </div>
</template>

<!-- Tiny keyframe Tailwind can't express: the completion flash pop. -->
<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .celebrate-flash {
    animation: celebrate-flash-in 0.5s var(--ease-spring) both;
  }
}
@keyframes celebrate-flash-in {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
