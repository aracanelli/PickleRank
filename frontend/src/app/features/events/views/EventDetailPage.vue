<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { eventsApi } from '../services/events.api'
import type { EventDto, GameDto, RatingUpdateDto } from '@/app/core/models/dto'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import Modal from '@/app/core/ui/components/Modal.vue'

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

const showCompletedModal = ref(false)
const ratingUpdates = ref<RatingUpdateDto[]>([])
const showPreview = ref(false)

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

function startEditing(game: GameDto) {
  editingGameId.value = game.id
  editingScoreTeam1.value = game.scoreTeam1?.toString() || ''
  editingScoreTeam2.value = game.scoreTeam2?.toString() || ''
}

function cancelEditing() {
  editingGameId.value = null
  editingScoreTeam1.value = ''
  editingScoreTeam2.value = ''
}

async function saveScore(game: GameDto) {
  if (!event.value) return
  
  savingGameIds.value.add(game.id)
  try {
    const score1 = editingScoreTeam1.value.trim() ? parseFloat(editingScoreTeam1.value) : undefined
    const score2 = editingScoreTeam2.value.trim() ? parseFloat(editingScoreTeam2.value) : undefined
    
    const updated = await eventsApi.updateScore(game.id, {
      scoreTeam1: score1,
      scoreTeam2: score2
    })
    
    // Update local state
    const idx = event.value.games.findIndex(g => g.id === updated.id)
    if (idx !== -1) {
      event.value.games[idx] = updated
    }
    if (event.value.status === 'GENERATED') {
      event.value.status = 'IN_PROGRESS'
    }
    
    editingGameId.value = null
  } catch (e: any) {
    error.value = e.message || 'Failed to save score'
  } finally {
    savingGameIds.value.delete(game.id)
  }
}

function handleScoreKeyup(game: GameDto, event: KeyboardEvent) {
  if (event.key === 'Enter') {
    saveScore(game)
  } else if (event.key === 'Escape') {
    cancelEditing()
  }
}

async function completeEvent() {
  if (!confirm('Complete this event and update ratings?')) return
  
  isCompleting.value = true
  error.value = ''
  try {
    const result = await eventsApi.complete(eventId.value)
    event.value = { ...event.value!, status: result.status }
    ratingUpdates.value = result.ratingUpdates
    showCompletedModal.value = true
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
</script>

<template>
  <div class="event-detail container">
    <LoadingSpinner v-if="isLoading" text="Loading event..." />

    <template v-else-if="event">
      <!-- Header -->
      <div class="page-header">
        <div>
          <router-link to="/groups" class="back-link">← Back to Groups</router-link>
          <h1>{{ event.name || 'Event' }}</h1>
          <div class="event-meta">
            <span class="status-badge" :class="event.status.toLowerCase()">
              {{ event.status }}
            </span>
            <span>{{ event.courts }} courts • {{ event.rounds }} rounds</span>
          </div>
        </div>
        <div class="header-actions">
          <BaseButton
            v-if="event.status !== 'COMPLETED'"
            variant="secondary"
            :loading="isGenerating"
            @click="generateSchedule(true)"
          >
            🔄 Regenerate
          </BaseButton>
          <BaseButton
            v-if="event.status !== 'COMPLETED' && event.status !== 'DRAFT'"
            :loading="isCompleting"
            @click="completeEvent"
          >
            ✓ Complete Event
          </BaseButton>
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

          <div class="preview-table-container">
            <table class="preview-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th v-for="court in event.courts" :key="court">Court {{ court }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(roundGames, roundIdx) in gamesByRound" :key="roundIdx">
                  <td class="round-cell">{{ roundIdx + 1 }}</td>
                  <td v-for="game in roundGames" :key="game.id" class="game-cell">
                    <div class="compact-game">
                      <div class="compact-team">
                        <span class="compact-players">{{ game.team1.map(p => p.displayName).join(' & ') }}</span>
                        <span class="compact-elo">({{ Math.round(game.team1Elo || 0) }})</span>
                      </div>
                      <span class="compact-vs">vs</span>
                      <div class="compact-team">
                        <span class="compact-players">{{ game.team2.map(p => p.displayName).join(' & ') }}</span>
                        <span class="compact-elo">({{ Math.round(game.team2Elo || 0) }})</span>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="preview-actions">
            <BaseButton variant="secondary" :loading="isGenerating" @click="regeneratePreview">
              🔄 Regenerate
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
          Round {{ idx + 1 }}
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
                    class="inline-score-input"
                    placeholder="0"
                    min="0"
                    @keyup="handleScoreKeyup(game, $event)"
                    @blur="saveScore(game)"
                    autofocus
                  />
                </div>
                <div v-else class="team-score" @click="event.status !== 'COMPLETED' && startEditing(game)">
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
                    class="inline-score-input"
                    placeholder="0"
                    min="0"
                    @keyup="handleScoreKeyup(game, $event)"
                    @blur="saveScore(game)"
                  />
                </div>
                <div v-else class="team-score" @click="event.status !== 'COMPLETED' && startEditing(game)">
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
                Saving...
              </div>
              <div v-else-if="event.status !== 'COMPLETED'" class="edit-hint">
                Click score to edit
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
      <template #footer>
        <BaseButton @click="showCompletedModal = false; router.back()">Done</BaseButton>
      </template>
    </Modal>
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
  display: inline-block;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  margin-bottom: var(--spacing-sm);
}

.page-header h1 {
  font-size: 2rem;
  margin-bottom: var(--spacing-sm);
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
.saving-indicator {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.saving-indicator {
  color: var(--color-primary);
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

/* Compact Preview Table */
.preview-table-container {
  overflow-x: auto;
  margin-bottom: var(--spacing-xl);
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.preview-table th,
.preview-table td {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
}

.preview-table th {
  background: var(--color-bg-secondary);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.round-cell {
  font-weight: 600;
  color: var(--color-primary);
  text-align: center;
  width: 60px;
  background: var(--color-bg-secondary);
}

.game-cell {
  min-width: 180px;
}

.compact-game {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.compact-team {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.compact-players {
  font-weight: 500;
  color: var(--color-text-primary);
}

.compact-elo {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.compact-vs {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  font-weight: 600;
  padding-left: var(--spacing-md);
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

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .games-grid {
    grid-template-columns: 1fr;
  }
}
</style>

