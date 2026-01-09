<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { X, Save, Trash2, AlertTriangle, ArrowLeftRight } from 'lucide-vue-next'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import type { MatchHistoryEntryDto } from '@/app/core/models/dto'
import { eventsApi } from '@/app/features/events/services/events.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'

interface EventData {
  id: string
  name: string
  date: string
  matches: MatchHistoryEntryDto[]
}

interface PendingScoreChange {
  scoreTeam1?: number
  scoreTeam2?: number
}

interface PendingPlayerSwap {
  team1P1: string
  team1P2: string
  team2P1: string
  team2P2: string
}

interface SelectedPlayer {
  gameId: string
  position: 'team1P1' | 'team1P2' | 'team2P1' | 'team2P2'
  playerId: string
  playerName: string
}

const props = defineProps<{
  open: boolean
  event: EventData | null
  groupId: string
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

// State
const isSaving = ref(false)
const pendingChanges = ref<Map<string, PendingScoreChange>>(new Map())
const pendingSwaps = ref<Map<string, PendingPlayerSwap>>(new Map())
const deletedGameIds = ref<Set<string>>(new Set())
const selectedPlayer = ref<SelectedPlayer | null>(null)
const error = ref('')
const activeRoundIndex = ref(0)

// Computed
const isDirty = computed(() => 
  pendingChanges.value.size > 0 || 
  pendingSwaps.value.size > 0 || 
  deletedGameIds.value.size > 0
)

const visibleMatches = computed(() => {
  if (!props.event) return []
  return props.event.matches.filter(m => !deletedGameIds.value.has(m.gameId))
})

// Get unique round numbers sorted
const roundNumbers = computed(() => {
  const rounds = new Set(visibleMatches.value.map(m => m.roundIndex))
  return Array.from(rounds).sort((a, b) => a - b)
})

// Get matches for the currently active round
const activeRoundMatches = computed(() => {
  return visibleMatches.value.filter(m => m.roundIndex === activeRoundIndex.value)
})

// Get display score (pending or original)
function getDisplayScore(match: MatchHistoryEntryDto, team: 1 | 2): number | undefined {
  const pending = pendingChanges.value.get(match.gameId)
  if (pending) {
    return team === 1 ? pending.scoreTeam1 : pending.scoreTeam2
  }
  return team === 1 ? match.scoreTeam1 : match.scoreTeam2
}

// Update pending score
function updateScore(match: MatchHistoryEntryDto, team: 1 | 2, value: string) {
  const numValue = value === '' ? undefined : parseFloat(value)
  const existing = pendingChanges.value.get(match.gameId) || {
    scoreTeam1: match.scoreTeam1,
    scoreTeam2: match.scoreTeam2
  }
  
  if (team === 1) {
    existing.scoreTeam1 = numValue
  } else {
    existing.scoreTeam2 = numValue
  }
  
  // Only track if different from original
  const hasChanged = existing.scoreTeam1 !== match.scoreTeam1 || existing.scoreTeam2 !== match.scoreTeam2
  if (hasChanged) {
    pendingChanges.value.set(match.gameId, existing)
  } else {
    pendingChanges.value.delete(match.gameId)
  }
}

// Delete a game
function deleteGame(gameId: string) {
  if (confirm('Are you sure you want to delete this game? This action cannot be undone after saving.')) {
    deletedGameIds.value.add(gameId)
    pendingChanges.value.delete(gameId)
  }
}

// Undo delete
function undoDelete(gameId: string) {
  deletedGameIds.value.delete(gameId)
}

// Get current player IDs (pending or original)
function getCurrentPlayers(match: MatchHistoryEntryDto) {
  const pending = pendingSwaps.value.get(match.gameId)
  if (pending) {
    return pending
  }
  return {
    team1P1: match.team1Ids[0],
    team1P2: match.team1Ids[1],
    team2P1: match.team2Ids[0],
    team2P2: match.team2Ids[1]
  }
}

// Get player name for a position (with swap tracking)
function getPlayerName(match: MatchHistoryEntryDto, position: 'team1P1' | 'team1P2' | 'team2P1' | 'team2P2'): string {
  const currentPlayers = getCurrentPlayers(match)
  const currentId = currentPlayers[position]
  
  // Build name lookup from ALL games in the event (for cross-game swaps)
  const allNames: Record<string, string> = {}
  if (props.event) {
    for (const m of props.event.matches) {
      allNames[m.team1Ids[0]] = m.team1[0]
      allNames[m.team1Ids[1]] = m.team1[1]
      allNames[m.team2Ids[0]] = m.team2[0]
      allNames[m.team2Ids[1]] = m.team2[1]
    }
  }
  return allNames[currentId] || 'Unknown'
}

// Select a player for swapping (restricted to same round only)
function selectPlayer(match: MatchHistoryEntryDto, position: 'team1P1' | 'team1P2' | 'team2P1' | 'team2P2') {
  const currentPlayers = getCurrentPlayers(match)
  const playerId = currentPlayers[position]
  const playerName = getPlayerName(match, position)
  
  if (selectedPlayer.value) {
    // If same player, deselect
    if (selectedPlayer.value.gameId === match.gameId && selectedPlayer.value.position === position) {
      selectedPlayer.value = null
      return
    }
    
    // Get the first player's game
    const firstMatch = props.event?.matches.find(m => m.gameId === selectedPlayer.value!.gameId)
    if (!firstMatch) {
      selectedPlayer.value = null
      return
    }
    
    // RESTRICTION: Only allow swaps within the same round
    if (firstMatch.roundIndex !== match.roundIndex) {
      // Different rounds - deselect and don't swap
      selectedPlayer.value = null
      return
    }
    
    const firstGamePlayers = getCurrentPlayers(firstMatch)
    const secondGamePlayers = getCurrentPlayers(match)
    
    // Get the player IDs being swapped
    const firstPlayerId = firstGamePlayers[selectedPlayer.value.position]
    const secondPlayerId = secondGamePlayers[position]
    
    if (selectedPlayer.value.gameId === match.gameId) {
      // Same game - simple swap
      const newPlayers = { ...secondGamePlayers }
      newPlayers[selectedPlayer.value.position] = secondPlayerId
      newPlayers[position] = firstPlayerId
      
      updateGameSwap(match, newPlayers)
    } else {
      // Different games in same round - cross-game swap
      // Update first game: replace first player with second player
      const newFirstGame = { ...firstGamePlayers }
      newFirstGame[selectedPlayer.value.position] = secondPlayerId
      updateGameSwap(firstMatch, newFirstGame)
      
      // Update second game: replace second player with first player
      const newSecondGame = { ...secondGamePlayers }
      newSecondGame[position] = firstPlayerId
      updateGameSwap(match, newSecondGame)
    }
    
    selectedPlayer.value = null
  } else {
    // No player selected, select this one
    selectedPlayer.value = { gameId: match.gameId, position, playerId, playerName }
  }
}

// Helper to update a game's pending swap
function updateGameSwap(match: MatchHistoryEntryDto, newPlayers: PendingPlayerSwap) {
  const original = {
    team1P1: match.team1Ids[0],
    team1P2: match.team1Ids[1],
    team2P1: match.team2Ids[0],
    team2P2: match.team2Ids[1]
  }
  
  const hasChanged = 
    newPlayers.team1P1 !== original.team1P1 ||
    newPlayers.team1P2 !== original.team1P2 ||
    newPlayers.team2P1 !== original.team2P1 ||
    newPlayers.team2P2 !== original.team2P2
  
  if (hasChanged) {
    pendingSwaps.value.set(match.gameId, newPlayers)
  } else {
    pendingSwaps.value.delete(match.gameId)
  }
}

// Check if a player is currently selected
function isPlayerSelected(gameId: string, position: string): boolean {
  return selectedPlayer.value?.gameId === gameId && selectedPlayer.value?.position === position
}

// Check if a game has pending swaps
function hasGameSwaps(gameId: string): boolean {
  return pendingSwaps.value.has(gameId)
}

// Close handler with dirty check
function handleClose() {
  if (isDirty.value) {
    if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
      return
    }
  }
  resetState()
  emit('close')
}

// Reset state
function resetState() {
  pendingChanges.value.clear()
  pendingSwaps.value.clear()
  deletedGameIds.value.clear()
  selectedPlayer.value = null
  error.value = ''
}

// Save changes
async function saveChanges() {
  if (!props.event) return
  
  isSaving.value = true
  error.value = ''
  
  try {
    // Apply game deletions first
    for (const gameId of deletedGameIds.value) {
      await eventsApi.deleteGame(gameId)
    }
    
    // Apply score updates
    for (const [gameId, changes] of pendingChanges.value) {
      await eventsApi.updateScore(gameId, {
        scoreTeam1: changes.scoreTeam1,
        scoreTeam2: changes.scoreTeam2
      })
    }
    
    // Apply player swaps
    for (const [gameId, players] of pendingSwaps.value) {
      await eventsApi.updateGamePlayers(gameId, {
        team1P1: players.team1P1,
        team1P2: players.team1P2,
        team2P1: players.team2P1,
        team2P2: players.team2P2
      })
    }
    
    // Recalculation is handled by backend on each change,
    // but we trigger one final recalculation to ensure consistency
    if (pendingChanges.value.size > 0 || pendingSwaps.value.size > 0 || deletedGameIds.value.size > 0) {
      await groupsApi.recalculateRatings(props.groupId)
    }
    
    resetState()
    emit('saved')
    emit('close')
  } catch (e: any) {
    error.value = e.message || 'Failed to save changes'
  } finally {
    isSaving.value = false
  }
}

// Prevent navigation when dirty
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

// Watch for open changes to manage body scroll
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    document.body.style.overflow = 'hidden'
    window.addEventListener('beforeunload', handleBeforeUnload)
  } else {
    document.body.style.overflow = ''
    window.removeEventListener('beforeunload', handleBeforeUnload)
    resetState()
  }
})

onUnmounted(() => {
  document.body.style.overflow = ''
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open && event" class="event-edit-modal">
        <!-- Header -->
        <header class="modal-header">
          <div class="header-left">
            <button class="close-btn" @click="handleClose" title="Close">
              <X :size="24" />
            </button>
            <div class="header-title">
              <h2>Edit Event</h2>
              <span class="event-name">{{ event.name }}</span>
            </div>
          </div>
          <div class="header-right">
            <span v-if="isDirty" class="dirty-indicator">Unsaved changes</span>
            <BaseButton 
              variant="primary" 
              :loading="isSaving" 
              :disabled="!isDirty"
              @click="saveChanges"
            >
              <Save :size="16" />
              Save & Recalculate
            </BaseButton>
          </div>
        </header>

        <!-- Content -->
        <main class="modal-content">
          <div v-if="error" class="error-banner">
            <AlertTriangle :size="16" />
            {{ error }}
          </div>

          <div class="warning-banner">
            <AlertTriangle :size="16" />
            Changes to scores will trigger a full ELO recalculation for the entire group.
          </div>

          <!-- Round Tabs -->
          <div class="round-tabs">
            <button 
              v-for="roundIndex in roundNumbers" 
              :key="roundIndex"
              class="round-tab"
              :class="{ active: activeRoundIndex === roundIndex }"
              @click="activeRoundIndex = roundIndex; selectedPlayer = null"
            >
              Round {{ roundIndex + 1 }}
            </button>
          </div>

          <!-- Matches for active round -->
          <div class="matches-list">
            <div 
              v-for="match in activeRoundMatches" 
              :key="match.gameId"
              class="match-item"
            >
              <BaseCard>
                <div class="match-card-content">
                  <div class="match-header">
                    <span class="round-court">
                      Court {{ match.courtIndex + 1 }}
                    </span>
                    <button 
                      class="delete-btn" 
                      @click="deleteGame(match.gameId)"
                      title="Delete game"
                    >
                      <Trash2 :size="16" />
                    </button>
                  </div>

                  <div class="match-teams-edit" :class="{ 'has-swaps': hasGameSwaps(match.gameId) }">
                    <!-- Selected player indicator -->
                    <div v-if="selectedPlayer" class="swap-hint">
                      <ArrowLeftRight :size="14" />
                      <span class="swap-hint-text">Tap a player in this round to swap with <strong>{{ selectedPlayer.playerName }}</strong></span>
                    </div>

                    <!-- Team 1 -->
                    <div class="team-container">
                      <div class="team-label">Team 1</div>
                      <div class="team-row">
                        <div class="team-players">
                          <button 
                            class="player-btn"
                            :class="{ 
                              selected: isPlayerSelected(match.gameId, 'team1P1'),
                              swapped: hasGameSwaps(match.gameId)
                            }"
                            @click="selectPlayer(match, 'team1P1')"
                            :title="'Tap to swap: ' + getPlayerName(match, 'team1P1')"
                          >
                            <span class="player-name">{{ getPlayerName(match, 'team1P1') }}</span>
                            <ArrowLeftRight :size="12" class="swap-icon" />
                          </button>
                          <button 
                            class="player-btn"
                            :class="{ 
                              selected: isPlayerSelected(match.gameId, 'team1P2'),
                              swapped: hasGameSwaps(match.gameId)
                            }"
                            @click="selectPlayer(match, 'team1P2')"
                            :title="'Tap to swap: ' + getPlayerName(match, 'team1P2')"
                          >
                            <span class="player-name">{{ getPlayerName(match, 'team1P2') }}</span>
                            <ArrowLeftRight :size="12" class="swap-icon" />
                          </button>
                        </div>
                        <input
                          type="number"
                          class="score-input"
                          :value="getDisplayScore(match, 1)"
                          @input="updateScore(match, 1, ($event.target as HTMLInputElement).value)"
                          min="0"
                          placeholder="0"
                          inputmode="numeric"
                        />
                      </div>
                    </div>

                    <div class="vs-divider">
                      <span class="vs-text">VS</span>
                    </div>

                    <!-- Team 2 -->
                    <div class="team-container">
                      <div class="team-label">Team 2</div>
                      <div class="team-row">
                        <div class="team-players">
                          <button 
                            class="player-btn"
                            :class="{ 
                              selected: isPlayerSelected(match.gameId, 'team2P1'),
                              swapped: hasGameSwaps(match.gameId)
                            }"
                            @click="selectPlayer(match, 'team2P1')"
                            :title="'Tap to swap: ' + getPlayerName(match, 'team2P1')"
                          >
                            <span class="player-name">{{ getPlayerName(match, 'team2P1') }}</span>
                            <ArrowLeftRight :size="12" class="swap-icon" />
                          </button>
                          <button 
                            class="player-btn"
                            :class="{ 
                              selected: isPlayerSelected(match.gameId, 'team2P2'),
                              swapped: hasGameSwaps(match.gameId)
                            }"
                            @click="selectPlayer(match, 'team2P2')"
                            :title="'Tap to swap: ' + getPlayerName(match, 'team2P2')"
                          >
                            <span class="player-name">{{ getPlayerName(match, 'team2P2') }}</span>
                            <ArrowLeftRight :size="12" class="swap-icon" />
                          </button>
                        </div>
                        <input
                          type="number"
                          class="score-input"
                          :value="getDisplayScore(match, 2)"
                          @input="updateScore(match, 2, ($event.target as HTMLInputElement).value)"
                          min="0"
                          placeholder="0"
                          inputmode="numeric"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </BaseCard>
            </div>
          </div>


          <!-- Deleted games section -->
          <div v-if="deletedGameIds.size > 0" class="deleted-section">
            <h4>Pending Deletions ({{ deletedGameIds.size }})</h4>
            <p class="deleted-warning">These games will be permanently deleted when you save.</p>
            <div v-for="gameId in deletedGameIds" :key="gameId" class="deleted-item">
              <span>Game {{ gameId.slice(0, 8) }}...</span>
              <button class="undo-btn" @click="undoDelete(gameId)">Undo</button>
            </div>
          </div>
        </main>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.event-edit-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--color-bg-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.header-title h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
}

.event-name {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.dirty-indicator {
  font-size: 0.75rem;
  color: var(--color-warning);
  font-weight: 500;
}

/* Content */
.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
  padding-bottom: calc(140px + env(safe-area-inset-bottom, 0px));
}

.error-banner {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error);
  margin-bottom: var(--spacing-md);
}

.warning-banner {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: var(--radius-md);
  color: var(--color-warning);
  font-size: 0.875rem;
  margin-bottom: var(--spacing-lg);
}

/* Round Tabs */
.round-tabs {
  display: flex;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--spacing-lg);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.round-tabs::-webkit-scrollbar {
  display: none;
}

.round-tab {
  flex: 1;
  min-width: 100px;
  padding: var(--spacing-sm) var(--spacing-md);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.round-tab:hover:not(.active) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.round-tab.active {
  background: var(--color-bg-card);
  border-color: var(--color-border);
  color: var(--color-primary);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* Match list */
.matches-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.match-item {
  width: 100%;
}

.match-card-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.match-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.round-court {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-muted);
  letter-spacing: 0.05em;
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.delete-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  border-color: var(--color-error);
  color: var(--color-error);
}

.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Teams edit layout */
.match-teams-edit {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.team-container {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
}

.team-label {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-sm);
}

.team-row {
  display: flex;
  align-items: stretch;
  gap: var(--spacing-md);
}

.team-players {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  flex: 1;
  min-width: 0;
}

.player-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  background: var(--color-bg-tertiary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: 10px 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
  min-height: 44px;
}

.player-btn .player-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  text-align: left;
  flex: 1;
  min-width: 0;
  /* Show full name with word wrap */
  word-break: break-word;
  line-height: 1.3;
}

.player-btn .swap-icon {
  color: var(--color-text-muted);
  opacity: 0.5;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}

.player-btn:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border);
}

.player-btn:hover .swap-icon {
  opacity: 1;
  color: var(--color-info);
}

.player-btn.selected {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
}

.player-btn.selected .player-name {
  color: #3b82f6;
}

.player-btn.selected .swap-icon {
  opacity: 1;
  color: #3b82f6;
}

.player-btn.swapped .player-name,
.player-btn.swapped .swap-icon {
  color: var(--color-warning);
}

.vs-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xs) 0;
}

.vs-text {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
  background: var(--color-bg-primary);
  padding: 4px 12px;
  border-radius: var(--radius-full);
  letter-spacing: 0.1em;
}

.swap-hint {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-sm);
}

.swap-hint svg {
  color: #3b82f6;
  flex-shrink: 0;
}

.swap-hint-text {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.swap-hint-text strong {
  color: #3b82f6;
  font-weight: 600;
}

.match-teams-edit.has-swaps .team-container {
  border-color: var(--color-warning);
  border-style: dashed;
  background: rgba(245, 158, 11, 0.03);
}

.score-input {
  width: 72px;
  height: auto;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-sm);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-primary);
  color: var(--color-primary);
  font-size: 1.5rem;
  font-weight: 700;
  font-family: var(--font-mono);
  text-align: center;
  flex-shrink: 0;
}

.score-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

/* Deleted section */
.deleted-section {
  margin-top: var(--spacing-xl);
  padding: var(--spacing-md);
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--radius-md);
}

.deleted-section h4 {
  margin: 0 0 var(--spacing-xs);
  color: var(--color-error);
}

.deleted-warning {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-sm);
}

.deleted-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-xs) 0;
}

.undo-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .modal-header {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
  }

  .header-left,
  .header-right {
    width: 100%;
  }

  .header-right {
    justify-content: space-between;
  }

  .modal-content {
    padding: var(--spacing-md);
    padding-bottom: calc(140px + env(safe-area-inset-bottom, 0px));
  }

  .team-container {
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .team-row {
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .team-players {
    width: 100%;
  }

  .score-input {
    width: 100%;
    height: 56px;
    font-size: 1.75rem;
  }

  .player-btn {
    padding: 12px 14px;
  }

  .player-btn .player-name {
    font-size: 0.9375rem;
  }

  .vs-divider {
    padding: var(--spacing-sm) 0;
  }

  .warning-banner {
    font-size: 0.8125rem;
    flex-direction: column;
    text-align: center;
  }

  .swap-hint {
    flex-direction: column;
    text-align: center;
    gap: var(--spacing-xs);
  }

  .round-tabs {
    margin-bottom: var(--spacing-md);
  }

  .round-tab {
    flex: none;
    min-width: 80px;
  }
}

/* Very small screens */
@media (max-width: 380px) {
  .player-btn .player-name {
    font-size: 0.875rem;
  }

  .score-input {
    font-size: 1.5rem;
    height: 52px;
  }
}
</style>
