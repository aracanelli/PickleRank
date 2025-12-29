<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { eventsApi } from '../services/events.api'
import type { EventDto, GameDto, RatingUpdateDto, GameResult } from '@/app/core/models/dto'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import Modal from '@/app/core/ui/components/Modal.vue'
import ShareableSchedule from '../components/ShareableSchedule.vue'
import ScoreEntryModal from '../components/ScoreEntryModal.vue'
import html2canvas from 'html2canvas'
import { Download, ArrowLeft } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const eventId = computed(() => route.params.eventId as string)

const event = ref<EventDto | null>(null)
const isLoading = ref(true)
const isGenerating = ref(false)
const isCompleting = ref(false)
const error = ref('')

const selectedRound = ref(0)
const editingGameId = ref<string | null>(null)
const editingScoreTeam1 = ref<string>('')
const editingScoreTeam2 = ref<string>('')
const savingGameIds = ref<Set<string>>(new Set())
const savedGameIds = ref<Set<string>>(new Set()) // Track recently saved for checkmark animation
const pendingSaves = ref<Map<string, number>>(new Map()) // game id -> timeout id for debounce
const queuedSaves = ref<Map<string, { score1?: number, score2?: number }>>(new Map()) // game id -> next scores to save
const draftScores = ref<Map<string, { score1: string, score2: string }>>(new Map()) // game id -> raw input strings

// Baseline scores per game - saved before optimistic updates for rollback on error
const gameBaselines = ref<Map<string, { score1?: number, score2?: number, result: GameResult }>>(new Map())
// Track persistent failures per game for visibility
const gameFailureCounts = ref<Map<string, number>>(new Map())

const showCompletedModal = ref(false)
const ratingUpdates = ref<RatingUpdateDto[]>([])
const showPreview = ref(false)

// Export functionality
const isExporting = ref(false)
const shareableRef = ref<HTMLElement | null>(null)

// Name editing
const isEditingName = ref(false)
const tempEventName = ref('')
const isSavingName = ref(false)

// Touch device detection for better UX hints
const isTouchDevice = computed(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0)

// Mobile score entry modal state
const showScoreModal = ref(false)
const scoreModalGame = ref<GameDto | null>(null)

function openScoreModal(game: GameDto) {
  scoreModalGame.value = game
  showScoreModal.value = true
}

function closeScoreModal() {
  showScoreModal.value = false
  scoreModalGame.value = null
}

async function handleModalSave(score1: number | undefined, score2: number | undefined) {
  if (!scoreModalGame.value || !event.value) return
  
  const game = scoreModalGame.value
  
  // Optimistic update
  const idx = event.value.games.findIndex(g => g.id === game.id)
  if (idx !== -1) {
    event.value.games[idx] = {
      ...event.value.games[idx],
      scoreTeam1: score1,
      scoreTeam2: score2,
      result: getResultFromScores(score1, score2)
    }
  }
  
  closeScoreModal()
  
  // Save to server
  await performSave(game.id, score1, score2)
}

function startEditName() {
  if (!event.value) return
  tempEventName.value = event.value.name || ''
  isEditingName.value = true
}

function cancelEditName() {
  isEditingName.value = false
  tempEventName.value = ''
}

async function saveName() {
  if (!event.value || !tempEventName.value.trim()) return
  
  const newName = tempEventName.value.trim()
  if (newName === event.value.name) {
    isEditingName.value = false
    return
  }

  // Optimistic update
  const oldName = event.value.name
  event.value.name = newName
  isEditingName.value = false
  
  isSavingName.value = true
  try {
    await eventsApi.update(event.value.id, { name: newName })
  } catch (e) {
    // Revert on error
    event.value.name = oldName
    error.value = 'Failed to update name'
  } finally {
    isSavingName.value = false
  }
}

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 500

// Cleanup pending timeouts on unmount
// Cleanup pending timeouts and save immediately on unmount
onUnmounted(() => {
  // Save all games with pending debounced saves using keepalive
  pendingSaves.value.forEach((timeoutId, gameId) => {
    clearTimeout(timeoutId)
    
    // Look up pending draft for this game
    const draft = draftScores.value.get(gameId)
    if (!draft) return // Should ideally exist if pending save exists, but safety check

    const s1 = parseFloat(draft.score1)
    const s2 = parseFloat(draft.score2)
    const score1 = isNaN(s1) ? undefined : s1
    const score2 = isNaN(s2) ? undefined : s2
    
    // Fire and forget with keepalive - request will complete even if page unloads
    eventsApi.updateScoreWithKeepalive(gameId, {
      scoreTeam1: score1,
      scoreTeam2: score2
    })
  })
  pendingSaves.value.clear()
  
  // Also flush any queued saves that haven't been processed yet
  queuedSaves.value.forEach((scores, gameId) => {
    eventsApi.updateScoreWithKeepalive(gameId, {
      scoreTeam1: scores.score1,
      scoreTeam2: scores.score2
    })
  })
  queuedSaves.value.clear()
})

onMounted(async () => {
  await loadEvent()
})

async function loadEvent() {
  isLoading.value = true
  try {
    event.value = await eventsApi.get(eventId.value)
    // Show preview if games are generated but not yet accepted
    if (event.value.status === 'GENERATED' && event.value.games.length > 0) {
      showPreview.value = true
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to load event'
  } finally {
    isLoading.value = false
  }
}

async function generateSchedule(newSeed = false) {
  if (event.value?.games && event.value.games.length > 0) {
    if (!confirm('Are you sure you want to regenerate? This will delete the current schedule and any entered scores.')) {
      return
    }
  }

  isGenerating.value = true
  error.value = ''
  try {
    const result = await eventsApi.generate(eventId.value, newSeed)
    event.value = { ...event.value!, status: result.status, generationMeta: result.generationMeta, games: result.games }
    showPreview.value = true
  } catch (e: any) {
    error.value = e.message || 'Failed to generate schedule'
  } finally {
    isGenerating.value = false
  }
}

function acceptPreview() {
  showPreview.value = false
}

function regeneratePreview() {
  generateSchedule(true)
}

const gamesByRound = computed(() => {
  if (!event.value) return []
  const rounds: GameDto[][] = []
  for (let i = 0; i < event.value.rounds; i++) {
    rounds.push(event.value.games.filter(g => g.roundIndex === i))
  }
  return rounds
})

const hasEnteredScores = computed(() => {
  return event.value?.games.some(g => g.scoreTeam1 != null || g.scoreTeam2 != null) ?? false
})

const allScoresEntered = computed(() => {
  return event.value?.games.every(g => g.scoreTeam1 != null && g.scoreTeam2 != null) ?? false
})

function startEditing(game: GameDto, teamIndex: 1 | 2 = 1) {

  
  editingGameId.value = game.id
  
  // Check if we have a pending draft, otherwise load from game
  const draft = draftScores.value.get(game.id)
  if (draft) {
    editingScoreTeam1.value = draft.score1
    editingScoreTeam2.value = draft.score2
  } else {
    editingScoreTeam1.value = game.scoreTeam1?.toString() || ''
    editingScoreTeam2.value = game.scoreTeam2?.toString() || ''
    // Initialize draft map immediately so we have a record if they start typing
    draftScores.value.set(game.id, { 
      score1: editingScoreTeam1.value, 
      score2: editingScoreTeam2.value 
    })
  }
  
  // Focus the correct input
  nextTick(() => {
    const selector = `.game-input-${game.id}.team-${teamIndex}`
    const input = document.querySelector(selector) as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  })
}

function cancelEditing() {
  if (editingGameId.value) {
    // Cancel any pending debounced save
    const timeoutId = pendingSaves.value.get(editingGameId.value)
    if (timeoutId) {
      clearTimeout(timeoutId)
      pendingSaves.value.delete(editingGameId.value)
    }
    // Also clear the draft for this game since we are cancelling
    draftScores.value.delete(editingGameId.value)
  }
  editingGameId.value = null
  editingScoreTeam1.value = ''
  editingScoreTeam2.value = ''
}

// Immediate save that flushes any pending debounced save
function flushPendingSave(gameId: string) {
  const timeoutId = pendingSaves.value.get(gameId)
  if (timeoutId) {
    clearTimeout(timeoutId)
    pendingSaves.value.delete(gameId)
  }
}

// Perform the actual save to the server
// Perform the actual save to the server
async function performSave(gameId: string, score1?: number, score2?: number) {
  if (!event.value) return
  
  // If already saving, queue this update to run after the current one finishes
  if (savingGameIds.value.has(gameId)) {
    queuedSaves.value.set(gameId, { score1, score2 })
    return
  }
  
  // Save baseline before first save attempt if not already saved
  // This allows reverting to original state on error without full reload
  if (!gameBaselines.value.has(gameId)) {
    const currentGame = event.value.games.find(g => g.id === gameId)
    if (currentGame) {
      gameBaselines.value.set(gameId, {
        score1: currentGame.scoreTeam1,
        score2: currentGame.scoreTeam2,
        result: currentGame.result
      })
    }
  }
  
  savingGameIds.value.add(gameId)
  
  try {
    const updated = await eventsApi.updateScoreWithKeepalive(gameId, {
      scoreTeam1: score1,
      scoreTeam2: score2
    })
    
    // Update local state with server response ONLY if no newer save is queued
    // If a save is queued, we want to keep the optimistic state (or current state) 
    // until that queued save completes, to avoid flickering back to an old state.
    if (!queuedSaves.value.has(gameId)) {
        const idx = event.value.games.findIndex(g => g.id === updated.id)
        if (idx !== -1) {
          event.value.games[idx] = updated
        }
        if (event.value.status === 'GENERATED') {
          event.value.status = 'IN_PROGRESS'
        }
        
        // Clear baseline and failure count on successful save
        gameBaselines.value.delete(gameId)
        gameFailureCounts.value.delete(gameId)
        
        // Show brief success indicator
        savedGameIds.value.add(gameId)
        setTimeout(() => savedGameIds.value.delete(gameId), 1500)
    }
    
  } catch (e: any) {
    const errorMessage = e.message || 'Failed to save score'
    
    // Always log the error for debugging visibility
    console.error(`[Score Save Error] Game ${gameId}:`, errorMessage, e)
    
    // Increment failure counter for this game
    const currentFailures = gameFailureCounts.value.get(gameId) || 0
    gameFailureCounts.value.set(gameId, currentFailures + 1)
    
    // Show user-visible error notification (don't silently swallow even if queued)
    error.value = `Failed to save score for game (attempt ${currentFailures + 1}): ${errorMessage}`
    
    // Revert only this game's optimistic state from baseline (avoid full reload)
    if (!queuedSaves.value.has(gameId) && event.value) {
      const baseline = gameBaselines.value.get(gameId)
      if (baseline) {
        const idx = event.value.games.findIndex(g => g.id === gameId)
        if (idx !== -1) {
          event.value.games[idx] = {
            ...event.value.games[idx],
            scoreTeam1: baseline.score1,
            scoreTeam2: baseline.score2,
            result: baseline.result
          }
        }
      }
      // Clear baseline after revert
      gameBaselines.value.delete(gameId)
    }
  } finally {
    savingGameIds.value.delete(gameId)
    
    // Determine if we need to process a queued save
    if (queuedSaves.value.has(gameId)) {
        const next = queuedSaves.value.get(gameId)
        queuedSaves.value.delete(gameId)
        // Process next save - await for proper error handling and potential backoff
        await performSave(gameId, next?.score1, next?.score2)
    }
  }
}

// Debounced save - schedules a save after delay
function debouncedSave(game: GameDto) {
  if (!event.value) return
  
  const score1Str = String(editingScoreTeam1.value ?? '').trim()
  const score2Str = String(editingScoreTeam2.value ?? '').trim()
  const score1 = score1Str ? parseFloat(score1Str) : undefined
  const score2 = score2Str ? parseFloat(score2Str) : undefined
  
  // Optimistic UI update - update immediately in local state
  const idx = event.value.games.findIndex(g => g.id === game.id)
  if (idx !== -1) {
    event.value.games[idx] = {
      ...event.value.games[idx],
      scoreTeam1: score1,
      scoreTeam2: score2,
      result: getResultFromScores(score1, score2)
    }
  }
  
  // Cancel existing debounce timer
  flushPendingSave(game.id)
  
  // Schedule new save
  const timeoutId = window.setTimeout(() => {
    pendingSaves.value.delete(game.id)
    performSave(game.id, score1, score2)
  }, DEBOUNCE_DELAY)
  
  pendingSaves.value.set(game.id, timeoutId)
}

function getResultFromScores(score1?: number, score2?: number): GameResult {
  if (score1 === undefined || score2 === undefined) {
    return 'UNSET'
  }
  if (score1 > score2) return 'TEAM1_WIN'
  if (score2 > score1) return 'TEAM2_WIN'
  return 'TIE'
}

// Save immediately (on Enter or explicit save)
async function saveScoreNow(game: GameDto, shouldClose = true) {
  if (!event.value) return
  
  // Cancel any pending debounced save
  flushPendingSave(game.id)
  
  const score1Str = String(editingScoreTeam1.value ?? '').trim()
  const score2Str = String(editingScoreTeam2.value ?? '').trim()
  const score1 = score1Str ? parseFloat(score1Str) : undefined
  const score2 = score2Str ? parseFloat(score2Str) : undefined
  
  // Optimistic update
  const idx = event.value.games.findIndex(g => g.id === game.id)
  if (idx !== -1) {
    event.value.games[idx] = {
      ...event.value.games[idx],
      scoreTeam1: score1,
      scoreTeam2: score2,
      result: getResultFromScores(score1, score2)
    }
  }
  
  if (shouldClose) {
    editingGameId.value = null
  }
  
  // Perform save
  await performSave(game.id, score1, score2)
}

function handleScoreBlur(game: GameDto, evt: FocusEvent) {
  // Check if we are moving focus to the other input of the same game
  const relatedTarget = evt.relatedTarget as HTMLElement
  if (relatedTarget && relatedTarget.classList.contains(`game-input-${game.id}`)) {
    // Just save, don't close
    saveScoreNow(game, false)
  } else {
    // Save and close
    saveScoreNow(game, true)
  }
}

function handleScoreKeyup(game: GameDto, evt: KeyboardEvent) {
  if (evt.key === 'Enter') {
    saveScoreNow(game)
  } else if (evt.key === 'Escape') {
    cancelEditing()
  }
}

// Handle input changes - triggers debounced save
function handleScoreInput(game: GameDto) {
  // Update the draft map with current inputs
  if (editingGameId.value === game.id) {
    draftScores.value.set(game.id, {
      score1: editingScoreTeam1.value,
      score2: editingScoreTeam2.value
    })
  }
  debouncedSave(game)
}

async function completeEvent() {
  if (!confirm('Complete this event and update ratings?')) return
  
  isCompleting.value = true
  error.value = ''
  try {
    const result = await eventsApi.complete(eventId.value)
    event.value = { ...event.value!, status: result.status }
    ratingUpdates.value = result.ratingUpdates
    
    // Redirect to group page
    if (event.value?.groupId) {
      router.push(`/groups/${event.value.groupId}`)
    } else {
      router.push('/groups')
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to complete event'
  } finally {
    isCompleting.value = false
  }
}

function getResultBadge(result: string): string {
  switch (result) {
    case 'TEAM1_WIN': return 'Team 1 Won'
    case 'TEAM2_WIN': return 'Team 2 Won'
    case 'TIE': return 'Tie'
    default: return 'No Score'
  }
}

// Export as image functionality
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
    
    if (!blob) {
      error.value = 'Failed to create image'
      return
    }    
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
    
    const url = URL.createObjectURL(blob)
    
    // Use download link approach for all platforms
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Delay revocation to ensure download completes
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) {    console.error('Failed to export image:', e)
    error.value = 'Failed to export image'
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div class="event-detail container">
    <LoadingSpinner v-if="isLoading" text="Loading event..." />

    <template v-else-if="event">
      <!-- Header -->
      <div class="page-header">
        <div>
          <router-link :to="`/groups/${event.groupId}`" class="back-link"><ArrowLeft :size="16" /> Back to Group</router-link>
          <div v-if="isEditingName" class="name-edit-wrapper">
             <input 
               v-model="tempEventName"
               @keyup.enter="saveName"
               @keyup.esc="cancelEditName"
               @blur="saveName"
               class="name-edit-input"
               autofocus
             />
          </div>
          <h1 v-else>
            {{ event.name || 'Event' }}
            <button class="edit-name-btn" @click="startEditName" title="Edit Name">✎</button>
          </h1>
          <div class="event-meta">
            <span class="status-badge" :class="event.status.toLowerCase()">
              {{ event.status }}
            </span>
            <span>{{ event.courts }} courts • {{ event.rounds }} rounds</span>
          </div>
        </div>
        <div class="header-actions">
          <!-- Preview Actions (only shown during preview) -->
          <template v-if="showPreview">
            <BaseButton
              variant="secondary"
              :loading="isGenerating"
              @click="generateSchedule(true)"
            >
              🔄 Regenerate
            </BaseButton>
            <BaseButton
              variant="secondary"
              :loading="isExporting"
              @click="exportAsImage"
            >
              <Download :size="16" />
              Export Schedule
            </BaseButton>
            <BaseButton @click="acceptPreview">
              ✓ Continue to Score Entry
            </BaseButton>
          </template>

          <!-- Normal Actions (hidden during preview) -->
          <template v-else>
            <BaseButton
              v-if="event.status !== 'COMPLETED' && !hasEnteredScores"
              variant="secondary"
              :loading="isGenerating"
              @click="generateSchedule(true)"
            >
              🔄 Regenerate
            </BaseButton>
            <BaseButton
              v-if="event.status !== 'COMPLETED' && event.status !== 'DRAFT'"
              :loading="isCompleting"
              :disabled="!allScoresEntered"
              @click="completeEvent"
              :title="!allScoresEntered ? 'Enter all scores to complete' : ''"
            >
              ✓ Complete Event
            </BaseButton>
          </template>
        </div>
      </div>

      <div v-if="error" class="error-message">{{ error }}</div>

      <!-- Preview Screen -->
      <div v-if="showPreview && event.games.length > 0" class="preview-screen">
        <BaseCard>
          <div class="preview-header">
            <h2>📋 Generated Games Preview</h2>
            <p class="preview-subtitle">Review the generated schedule before entering scores</p>
          </div>

          <div v-if="event.generationMeta" class="gen-meta">
            <span>ELO diff: {{ (event.generationMeta.eloDiffUsed * 100).toFixed(0) }}%</span>
            <span v-if="event.generationMeta.relaxIterations > 0">
              (relaxed {{ event.generationMeta.relaxIterations }}x)
            </span>
            <span>• Generated in {{ event.generationMeta.durationMs }}ms</span>
          </div>

          <!-- Mobile-friendly card layout (shows all rounds) -->
          <div class="preview-rounds">
            <div 
              v-for="(roundGames, roundIdx) in gamesByRound" 
              :key="roundIdx" 
              class="preview-round-section"
            >
              <h3 class="round-section-header">Round {{ roundIdx + 1 }}</h3>
              <div class="preview-games-grid">
                <div 
                  v-for="game in roundGames" 
                  :key="game.id" 
                  class="preview-game-card"
                >
                  <div class="preview-court-label">Court {{ game.courtIndex + 1 }}</div>
                  <div class="preview-matchup">
                    <div class="preview-team">
                      <span class="preview-players">{{ game.team1.map(p => p.displayName).join(' & ') }}</span>
                      <span class="preview-elo">ELO: {{ Math.round(game.team1Elo || 0) }}</span>
                    </div>
                    <div class="preview-vs">VS</div>
                    <div class="preview-team">
                      <span class="preview-players">{{ game.team2.map(p => p.displayName).join(' & ') }}</span>
                      <span class="preview-elo">ELO: {{ Math.round(game.team2Elo || 0) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="preview-actions">
            <BaseButton variant="secondary" :loading="isGenerating" @click="regeneratePreview">
              🔄 Regenerate
            </BaseButton>
            <BaseButton variant="secondary" :loading="isExporting" @click="exportAsImage">
              <Download :size="16" />
              Export Schedule
            </BaseButton>
            <BaseButton @click="acceptPreview">
              ✓ Continue to Score Entry
            </BaseButton>
          </div>
        </BaseCard>
      </div>

      <!-- Main Score Entry (hidden during preview) -->
      <template v-else>
        <!-- Generation Meta -->
        <div v-if="event.generationMeta" class="gen-meta">
          <span>ELO diff: {{ (event.generationMeta.eloDiffUsed * 100).toFixed(0) }}%</span>
          <span v-if="event.generationMeta.relaxIterations > 0">
            (relaxed {{ event.generationMeta.relaxIterations }}x)
          </span>
          <span>• Generated in {{ event.generationMeta.durationMs }}ms</span>
        </div>

        <!-- Generate Button (if DRAFT) -->
        <div v-if="event.status === 'DRAFT'" class="generate-prompt">
          <BaseCard>
            <div class="generate-content">
              <h3>Ready to generate games?</h3>
              <p>Click the button below to generate the match schedule for this event.</p>
              <BaseButton :loading="isGenerating" @click="generateSchedule(false)">
                Generate Games
              </BaseButton>
            </div>
          </BaseCard>
        </div>

      <!-- Round Tabs -->
      <div class="round-tabs">
        <button
          v-for="(_, idx) in gamesByRound"
          :key="idx"
          class="round-tab"
          :class="{ active: selectedRound === idx }"
          @click="selectedRound = idx"
        >
          <span class="round-full">Round {{ idx + 1 }}</span>
          <span class="round-abbrev">R{{ idx + 1 }}</span>
        </button>
      </div>

      <!-- Games Grid -->
      <div class="games-grid">
        <BaseCard v-for="game in gamesByRound[selectedRound]" :key="game.id">
          <div class="game-card">
            <div class="court-label">Court {{ game.courtIndex + 1 }}</div>
            
            <div class="teams">
              <div class="team" :class="{ winner: game.result === 'TEAM1_WIN' }">
                <div class="team-players">
                  <span v-for="p in game.team1" :key="p.id" class="player-name">
                    {{ p.displayName }}
                  </span>
                </div>
                <div class="team-elo">ELO: {{ Math.round(game.team1Elo || 0) }}</div>
                <div v-if="editingGameId === game.id" class="score-input-wrapper">
                  <input
                    type="number"
                    v-model="editingScoreTeam1"
                    class="inline-score-input team-1"
                    :class="`game-input-${game.id}`"
                    placeholder="0"
                    @keyup="handleScoreKeyup(game, $event)"
                    @input="handleScoreInput(game)"
                    @blur="handleScoreBlur(game, $event)"
                    autofocus
                  />
                </div>
                <div v-else class="team-score" @click="event.status !== 'COMPLETED' && (isTouchDevice ? openScoreModal(game) : startEditing(game, 1))">
                  {{ game.scoreTeam1 ?? '-' }}
                </div>
              </div>
              
              <div class="vs">VS</div>
              
              <div class="team" :class="{ winner: game.result === 'TEAM2_WIN' }">
                <div class="team-players">
                  <span v-for="p in game.team2" :key="p.id" class="player-name">
                    {{ p.displayName }}
                  </span>
                </div>
                <div class="team-elo">ELO: {{ Math.round(game.team2Elo || 0) }}</div>
                <div v-if="editingGameId === game.id" class="score-input-wrapper">
                  <input
                    type="number"
                    v-model="editingScoreTeam2"
                    class="inline-score-input team-2"
                    :class="`game-input-${game.id}`"
                    placeholder="0"
                    min="0"
                    @keyup="handleScoreKeyup(game, $event)"
                    @input="handleScoreInput(game)"
                    @blur="handleScoreBlur(game, $event)"
                  />
                </div>
                <div v-else class="team-score" @click="event.status !== 'COMPLETED' && (isTouchDevice ? openScoreModal(game) : startEditing(game, 2))">
                  {{ game.scoreTeam2 ?? '-' }}
                </div>
              </div>
            </div>

            <div class="game-footer">
              <span class="result-badge" :class="game.result.toLowerCase()">
                {{ getResultBadge(game.result) }}
              </span>
              <div v-if="editingGameId === game.id" class="editing-hint">
                Press Enter to save, Esc to cancel
              </div>
              <div v-else-if="savingGameIds.has(game.id)" class="saving-indicator">
                ⏳ Saving...
              </div>
              <div v-else-if="savedGameIds.has(game.id)" class="saved-indicator">
                ✓ Saved
              </div>
              <div v-else-if="pendingSaves.has(game.id)" class="pending-indicator">
                Auto-saving...
              </div>
              <div v-else-if="event.status !== 'COMPLETED'" class="edit-hint">
                {{ isTouchDevice ? 'Tap' : 'Click' }} score to edit
              </div>
            </div>
          </div>
        </BaseCard>
      </div>
      </template>
    </template>


    <!-- Completed Modal -->
    <Modal :open="showCompletedModal" title="🎉 Event Completed!" @close="showCompletedModal = false">
      <div class="completed-content">
        <p>Ratings have been updated based on the results:</p>
        <div class="rating-updates">
          <div v-for="update in ratingUpdates" :key="update.playerId" class="rating-row">
            <span class="player-name">{{ update.displayName }}</span>
            <span class="rating-change" :class="{ positive: update.delta > 0, negative: update.delta < 0 }">
              {{ update.delta > 0 ? '+' : '' }}{{ update.delta.toFixed(1) }}
            </span>
            <span class="new-rating">→ {{ Math.round(update.ratingAfter) }}</span>
          </div>
        </div>
      </div>

    </Modal>

    <!-- Mobile Score Entry Modal -->
    <ScoreEntryModal
      :open="showScoreModal"
      :team1-names="scoreModalGame?.team1.map(p => p.displayName) ?? []"
      :team2-names="scoreModalGame?.team2.map(p => p.displayName) ?? []"
      :initial-score1="scoreModalGame?.scoreTeam1"
      :initial-score2="scoreModalGame?.scoreTeam2"
      @close="closeScoreModal"
      @save="handleModalSave"
    />

    <!-- Hidden container for export (off-screen) -->
    <div class="export-hidden-container">
      <div ref="shareableRef">
        <ShareableSchedule 
          v-if="event" 
          :event="event" 
          :gamesByRound="gamesByRound" 
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-lg);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 6px 12px;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
  transition: all var(--transition-fast);
  margin-bottom: var(--spacing-md);
}

.back-link:hover {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

.page-header h1 {
  font-size: 2rem;
  margin-bottom: var(--spacing-sm);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.edit-name-btn {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity var(--transition-fast);
  padding: 0;
}

.edit-name-btn:hover {
  opacity: 1;
}

.name-edit-input {
  font-size: 2rem;
  font-weight: 700;
  padding: 0 var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  width: 100%;
  max-width: 400px;
}

/* Hide spin buttons for score inputs */
.inline-score-input::-webkit-outer-spin-button,
.inline-score-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.inline-score-input {
  -moz-appearance: textfield;
}

.event-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  color: var(--color-text-secondary);
}

.status-badge {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.draft { background: var(--color-bg-tertiary); }
.status-badge.generated { background: rgba(59, 130, 246, 0.2); color: var(--color-info); }
.status-badge.in_progress { background: rgba(245, 158, 11, 0.2); color: var(--color-warning); }
.status-badge.completed { background: rgba(34, 197, 94, 0.2); color: var(--color-success); }

.header-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.error-message {
  padding: var(--spacing-md);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error);
  margin-bottom: var(--spacing-lg);
}

.gen-meta {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-lg);
}

.round-tabs {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
  overflow-x: auto;
}

.round-tab {
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
}

.round-tab:hover {
  border-color: var(--color-primary);
}

.round-tab.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

/* Round tab text variations - full on desktop, abbreviated on mobile */
.round-tab .round-full {
  display: inline;
}

.round-tab .round-abbrev {
  display: none;
}

@media (max-width: 480px) {
  .round-tab .round-full {
    display: none;
  }
  
  .round-tab .round-abbrev {
    display: inline;
  }
  
  .round-tabs {
    gap: var(--spacing-xs);
  }
  
  .round-tab {
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: 0.875rem;
    min-width: 44px;
    min-height: 44px;
  }
}

.games-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: var(--spacing-lg);
}

.game-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.court-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-muted);
  letter-spacing: 0.05em;
}

.teams {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.team {
  flex: 1;
  text-align: center;
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border: 2px solid transparent;
}

.team.winner {
  border-color: var(--color-success);
  background: rgba(34, 197, 94, 0.05);
}

.team-players {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
}

.player-name {
  font-weight: 500;
  font-size: 0.875rem;
}

.team-score {
  font-size: 1.5rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--color-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
  padding: var(--spacing-xs);
  border-radius: var(--radius-sm);
}

.team-score:hover {
  background: var(--color-bg-secondary);
}

.vs {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.game-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-badge {
  font-size: 0.75rem;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.result-badge.team1_win,
.result-badge.team2_win {
  background: rgba(34, 197, 94, 0.1);
  color: var(--color-success);
}

.result-badge.tie {
  background: rgba(245, 158, 11, 0.1);
  color: var(--color-warning);
}

/* Inline Score Editing */
.score-input-wrapper {
  display: flex;
  justify-content: center;
}

.inline-score-input {
  width: 80px;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-primary);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 1.5rem;
  font-weight: 700;
  font-family: var(--font-mono);
  text-align: center;
  outline: none;
}

.inline-score-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

.editing-hint,
.edit-hint,
.saving-indicator,
.saved-indicator,
.pending-indicator {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.saving-indicator {
  color: var(--color-primary);
}

.saved-indicator {
  color: var(--color-success);
  animation: fadeIn 0.2s ease-in;
}

.pending-indicator {
  color: var(--color-text-muted);
  opacity: 0.7;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Preview Screen */
.preview-screen {
  margin-bottom: var(--spacing-xl);
}

.preview-header {
  text-align: center;
  margin-bottom: var(--spacing-lg);
}

.preview-header h2 {
  font-size: 1.5rem;
  margin-bottom: var(--spacing-xs);
}

.preview-subtitle {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

/* Mobile-friendly Preview Cards */
.preview-rounds {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
}

.preview-round-section {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
}

.round-section-header {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
  border-bottom: 2px solid var(--color-primary);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.preview-games-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--spacing-md);
}

.preview-game-card {
  background: var(--color-bg-primary);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
}

.preview-court-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-muted);
  letter-spacing: 0.05em;
  margin-bottom: var(--spacing-sm);
}

.preview-matchup {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.preview-team {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.preview-players {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--color-text-primary);
}

.preview-elo {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.preview-vs {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--spacing-xs) 0;
}

/* Team ELO in score entry */
.team-elo {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  margin-bottom: var(--spacing-xs);
}

.preview-actions {
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
  flex-wrap: wrap;
}

.preview-actions .base-button {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.generate-prompt {
  margin-bottom: var(--spacing-xl);
}

.generate-content {
  text-align: center;
  padding: var(--spacing-lg);
}

.generate-content h3 {
  font-size: 1.25rem;
  margin-bottom: var(--spacing-sm);
}

.generate-content p {
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
}

/* Completed Modal */
.completed-content p {
  margin-bottom: var(--spacing-lg);
  color: var(--color-text-secondary);
}

.rating-updates {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.rating-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.rating-row .player-name {
  flex: 1;
}

.rating-change {
  font-weight: 600;
  font-family: var(--font-mono);
}

.rating-change.positive {
  color: var(--color-success);
}

.rating-change.negative {
  color: var(--color-error);
}

.new-rating {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

/* Export Modal */
.export-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.export-hint {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  text-align: center;
}

.export-preview-container {
  max-height: 400px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
}

.shareable-wrapper {
  transform-origin: top left;
  transform: scale(0.5);
  width: 200%;
}

.export-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--color-border);
}

.export-actions .base-button {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .header-actions {
    width: 100%;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  
  .header-actions button,
  .header-actions .base-button {
    width: 100%;
    justify-content: center;
  }

  .games-grid {
    grid-template-columns: 1fr;
  }

  .preview-games-grid {
    grid-template-columns: 1fr;
  }

  .preview-actions {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
  }

  .preview-actions button,
  .preview-actions .base-button {
    width: 100%;
    justify-content: center;
  }
  
  .preview-header h2 {
    font-size: 1.25rem;
  }
  
  .gen-meta {
    font-size: 0.75rem;
    flex-wrap: wrap;
  }
}

/* Hidden container for export - positioned off-screen but still renderable */
.export-hidden-container {
  position: fixed;
  left: -9999px;
  top: 0;
  pointer-events: none;
}
</style>







