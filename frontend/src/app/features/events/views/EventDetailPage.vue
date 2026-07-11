<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import html2canvas from 'html2canvas'
import { MoreVertical, Pencil, RefreshCw, Download, Trash2, Sparkles, ArrowLeftRight, Users2 } from 'lucide-vue-next'
import { eventsApi } from '../services/events.api'
import type { EventDto, GameDto, RatingUpdateDto, PlayerInfo } from '@/app/core/models/dto'
import { useGroupContextStore } from '@/stores/group-context'
import { useToast } from '@/app/core/ui/composables/useToast'
import { useConfirm } from '@/app/core/ui/composables/useConfirm'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import { useScoreAutosave } from '../composables/useScoreAutosave'
import HeaderActions from '@/app/core/layout/HeaderActions.vue'
import IconButton from '@/app/core/ui/components/IconButton.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppBadge from '@/app/core/ui/components/AppBadge.vue'
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
import CompleteResultsSheet from '../components/CompleteResultsSheet.vue'

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

onMounted(() => loadEvent())

async function loadEvent(silent = false) {
  if (!silent) isLoading.value = true
  loadError.value = ''
  try {
    event.value = await eventsApi.get(eventId.value)
    // Group context: only the groupId is known here (name/role stay as-is)
    groupContext.setGroup({ groupId: event.value.groupId })
    // Show preview when games are generated but not yet accepted; silent
    // reloads (autosave recovery, swaps) must not bounce back into preview.
    if (!silent && event.value.status === 'GENERATED' && event.value.games.length > 0) {
      showPreview.value = true
    }
    if (Number(selectedRoundKey.value) >= event.value.rounds) selectedRoundKey.value = '0'
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
    case 'IN_PROGRESS': return { label: 'In progress', variant: 'warning' as const }
    case 'COMPLETED': return { label: 'Completed', variant: 'success' as const }
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
// Scoring
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
// Per-game menu / reteam / delete game
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
  <HeaderActions>
    <IconButton v-if="event && hasHeaderActions" label="Event actions" @click="actionsOpen = true">
      <MoreVertical class="size-5" />
    </IconButton>
  </HeaderActions>

  <div class="mx-auto w-full max-w-5xl px-4 py-5 md:px-6" :class="showCompleteBar ? 'pb-28' : ''">
    <SkeletonList v-if="isLoading" :rows="5" />

    <ErrorState v-else-if="loadError" :message="loadError" @retry="loadEvent()" />

    <div v-else-if="event" class="flex flex-col gap-4">
      <!-- Event title block -->
      <div class="flex flex-col gap-1.5">
        <AppInput
          v-if="isEditingName"
          id="event-name-edit"
          v-model="tempEventName"
          placeholder="Event name"
          @keyup.enter="saveName"
          @keyup.esc="cancelEditName"
          @focusout="saveName"
        />
        <div v-else class="flex items-center gap-1">
          <h1 class="min-w-0 truncate text-xl font-bold text-ink md:text-2xl">
            {{ event.name || 'Event' }}
          </h1>
          <IconButton v-if="canManage" label="Edit name" @click="startEditName">
            <Pencil class="size-4" />
          </IconButton>
        </div>
        <div class="flex items-center gap-2.5">
          <AppBadge :variant="statusMeta.variant">{{ statusMeta.label }}</AppBadge>
          <span class="text-sm text-ink-muted">
            {{ event.courts }} {{ event.courts === 1 ? 'court' : 'courts' }} · {{ event.rounds }} rounds
          </span>
        </div>
      </div>

      <!-- DRAFT: generate hero -->
      <div
        v-if="event.status === 'DRAFT'"
        class="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface-1 px-6 py-10 text-center"
      >
        <div class="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <Sparkles class="size-7" aria-hidden="true" />
        </div>
        <h2 class="text-base font-semibold text-ink">Ready to generate games?</h2>
        <p class="max-w-sm text-sm text-ink-muted">
          Build the match schedule for {{ event.participantCount }} players across
          {{ event.courts }} {{ event.courts === 1 ? 'court' : 'courts' }}.
        </p>
        <AppButton v-if="canManage" :loading="isGenerating" class="mt-1" @click="generateSchedule(false)">
          <Sparkles class="size-4" aria-hidden="true" />
          Generate schedule
        </AppButton>
        <p v-else class="text-sm text-ink-faint">An organizer can generate the schedule.</p>
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

      <!-- Live scoring / completed -->
      <template v-else>
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

  <!-- Sticky completion bar (above the bottom tab bar) -->
  <div
    v-if="showCompleteBar && event"
    class="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface-page/95 pb-safe backdrop-blur md:bottom-0"
  >
    <div class="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-6">
      <span class="text-sm text-ink-muted">
        <span class="font-mono font-semibold tabular-nums text-ink">{{ scoredCount }}/{{ event.games.length }}</span>
        scored
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

  <!-- Per-game menu -->
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
    @change="(id, s1, s2) => debouncedSave(id, s1, s2)"
    @commit="(id, s1, s2) => saveNow(id, s1, s2)"
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

  <CompleteResultsSheet
    v-if="event"
    v-model="resultsSheetOpen"
    :updates="ratingUpdates"
    :group-id="event.groupId"
  />

  <!-- Hidden container for image export (off-screen but renderable) -->
  <div class="pointer-events-none fixed left-[-9999px] top-0" aria-hidden="true">
    <div ref="shareableRef">
      <ShareableSchedule v-if="event" :event="event" :games-by-round="gamesByRound" />
    </div>
  </div>
</template>
