<script setup lang="ts">
import { ArrowLeft, ChartBar, Edit2, AlertTriangle, Filter, Trophy, Activity, LayoutDashboard } from 'lucide-vue-next'
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { rankingsApi } from '../services/rankings.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { eventsApi } from '@/app/features/events/services/events.api'
import type { MatchHistoryEntryDto, GroupDto, GroupPlayerDto, EventListItemDto } from '@/app/core/models/dto'
import { useAuthStore } from '@/stores/auth'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import EmptyState from '@/app/core/ui/components/EmptyState.vue'
import Modal from '@/app/core/ui/components/Modal.vue'

const authStore = useAuthStore()
const currentUserId = computed(() => authStore.userId)

const route = useRoute()
const router = useRouter()
const groupId = computed(() => route.params.groupId as string)

// Find current user's player for Stats button - use cached value for instant display
const cachedPlayerId = ref<string | null>(null)
const cacheKey = computed(() => `myPlayerId_${groupId.value}`)

// Initialize from cache immediately
if (typeof sessionStorage !== 'undefined') {
  const cached = sessionStorage.getItem(`myPlayerId_${route.params.groupId}`)
  if (cached) cachedPlayerId.value = cached
}

const myPlayer = computed(() => {
  // First try to find from loaded data
  if (players.value.length > 0 && currentUserId.value) {
    const player = players.value.find(p => p.userId === currentUserId.value)
    if (player) {
      // Cache for next navigation
      sessionStorage.setItem(cacheKey.value, player.id)
      return player
    }
  }
  // Fall back to cached ID for instant display
  if (cachedPlayerId.value) {
    return { id: cachedPlayerId.value } as any
  }
  return null
})

const group = ref<GroupDto | null>(null)
const players = ref<GroupPlayerDto[]>([])
const events = ref<EventListItemDto[]>([])
const matches = ref<MatchHistoryEntryDto[]>([])
const isLoading = ref(true)
const error = ref('')

// Filter state
const filterEventId = ref<string>('')
const filterPlayerId = ref<string>('')
const filterSecondaryPlayerId = ref<string>('')
const filterRelationship = ref<'teammate' | 'opponent'>('teammate')

// Check if current user is the group owner or has ORGANIZER role
const isOrganizer = computed(() => {
  // First check if user is the group owner
  if (group.value && currentUserId.value && group.value.ownerUserId === currentUserId.value) {
    return true
  }
  
  // Otherwise check if user has a linked player with ORGANIZER role
  const myPlayer = players.value.find(
    p => p.userId && p.userId === currentUserId.value && p.role === 'ORGANIZER'
  )
  return !!myPlayer
})

onMounted(async () => {
  await Promise.all([loadGroup(), loadPlayers(), loadEvents()])
  
  // Check for playerId query param first
  const queryPlayerId = route.query.playerId as string | undefined
  if (queryPlayerId) {
    filterPlayerId.value = queryPlayerId
  } else if (currentUserId.value) {
    // Auto-filter by current user's linked player if no query param
    const myPlayer = players.value.find(p => p.userId === currentUserId.value)
    if (myPlayer) {
      filterPlayerId.value = myPlayer.playerId
    }
  }
  
  await loadHistory()
})

// Watch for filter changes
watch([filterEventId, filterPlayerId, filterSecondaryPlayerId, filterRelationship], () => {
  // If primary player is cleared, clear secondary too
  if (!filterPlayerId.value) {
    filterSecondaryPlayerId.value = ''
  }
  loadHistory()
})

async function loadGroup() {
  try {
    group.value = await groupsApi.get(groupId.value)
  } catch (e: any) {
    error.value = e.message
  }
}

async function loadPlayers() {
  try {
    const groupPlayersRes = await groupsApi.getPlayers(groupId.value)
    players.value = groupPlayersRes.players
  } catch (e: any) {
    console.error('Failed to load players:', e)
  }
}

async function loadEvents() {
  try {
    const eventsRes = await eventsApi.list(groupId.value, 'COMPLETED')
    events.value = eventsRes.events
  } catch (e: any) {
    console.error('Failed to load events:', e)
  }
}

async function loadHistory() {
  isLoading.value = true
  try {
    const options: { 
      playerId?: string; 
      eventId?: string;
      secondaryPlayerId?: string;
      relationship?: 'teammate' | 'opponent';
    } = {}
    
    if (filterPlayerId.value) {
      options.playerId = filterPlayerId.value
      
      // Secondary filter only applies if primary is selected
      if (filterSecondaryPlayerId.value) {
        options.secondaryPlayerId = filterSecondaryPlayerId.value
        options.relationship = filterRelationship.value
      }
    }
    
    if (filterEventId.value) {
      options.eventId = filterEventId.value
    }
    const response = await rankingsApi.getHistory(groupId.value, options)
    matches.value = response.matches
  } catch (e: any) {
    error.value = e.message || 'Failed to load history'
  } finally {
    isLoading.value = false
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function getResultLabel(result: string): string {
  switch (result) {
    case 'TEAM1_WIN': return 'Team 1 Won'
    case 'TEAM2_WIN': return 'Team 2 Won'
    case 'TIE': return 'Tie'
    default: return result
  }
}

// Group matches by event with ID
const matchesByEvent = computed(() => {
  const eventsMap: Map<string, { id: string; name: string; date: string; matches: MatchHistoryEntryDto[] }> = new Map()
  
  for (const match of matches.value) {
    if (!eventsMap.has(match.eventId)) {
      eventsMap.set(match.eventId, {
        id: match.eventId,
        name: match.eventName || 'Event',
        date: match.date,
        matches: []
      })
    }
    eventsMap.get(match.eventId)!.matches.push(match)
  }
  
  // Sort by date (newest first)
  return Array.from(eventsMap.values()).sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })
})

function clearFilters() {
  filterEventId.value = ''
  filterPlayerId.value = ''
  filterSecondaryPlayerId.value = ''
  filterRelationship.value = 'teammate'
}

// Alphabetically sorted players for filter dropdown
const sortedPlayers = computed(() => {
  return [...players.value].sort((a, b) => 
    a.displayName.localeCompare(b.displayName)
  )
})

// Get filtered player's display name
const filteredPlayerName = computed(() => {
  if (!filterPlayerId.value) return null
  const player = players.value.find(p => p.playerId === filterPlayerId.value)
  return player?.displayName || null
})

// Determine if filtered player won or lost a match
function getMatchOutcome(match: MatchHistoryEntryDto): 'win' | 'loss' | 'tie' | null {
  if (!filteredPlayerName.value) return null
  
  const playerName = filteredPlayerName.value
  const isOnTeam1 = match.team1.includes(playerName)
  const isOnTeam2 = match.team2.includes(playerName)
  
  if (!isOnTeam1 && !isOnTeam2) return null
  
  if (match.result === 'TIE') return 'tie'
  
  if (isOnTeam1) {
    return match.result === 'TEAM1_WIN' ? 'win' : 'loss'
  } else {
    return match.result === 'TEAM2_WIN' ? 'win' : 'loss'
  }
}

// History Editing
const showEditModal = ref(false)
const editingMatch = ref<MatchHistoryEntryDto | null>(null)
const editScore1 = ref<number | undefined>(undefined)
const editScore2 = ref<number | undefined>(undefined)
const isSavingEdit = ref(false)

function openEditMatch(match: MatchHistoryEntryDto) {
  editingMatch.value = match
  editScore1.value = match.scoreTeam1
  editScore2.value = match.scoreTeam2
  showEditModal.value = true
}

async function saveMatchEdit() {
  if (!editingMatch.value) return
  
  isSavingEdit.value = true
  try {
    await eventsApi.updateScore(editingMatch.value.gameId, {
      scoreTeam1: editScore1.value,
      scoreTeam2: editScore2.value
    })
    
    // Close and reload to get recalculated values
    showEditModal.value = false
    await loadHistory()
  } catch (e: any) {
    alert('Failed to update score: ' + e.message)
  } finally {
    isSavingEdit.value = false
  }
}
</script>

<template>
  <div class="history-page container">
    <div class="page-header">
      <div>
        <router-link :to="`/groups/${groupId}`" class="back-link">
          <ArrowLeft :size="16" /> Back to Group
        </router-link>
        <h1><ChartBar :size="32" class="page-title-icon" /> Match History</h1>
        <p class="subtitle">All completed games in this group</p>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="filter-icon">
        <Filter :size="18" />
        <span>Filters</span>
      </div>
      
      <div class="filter-controls">
        <div class="filter-group">
          <label for="event-filter">Event</label>
          <select id="event-filter" v-model="filterEventId" class="filter-select">
            <option value="">All Events</option>
            <option v-for="event in events" :key="event.id" :value="event.id">
              {{ event.name || formatDate(event.startsAt || '') }}
            </option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="player-filter">Player</label>
          <select id="player-filter" v-model="filterPlayerId" class="filter-select">
            <option value="">All Players</option>
            <option v-for="player in sortedPlayers" :key="player.playerId" :value="player.playerId">
              {{ player.displayName }}
            </option>
          </select>
        </div>

        <!-- Secondary Filter (Visible only when primary player is selected) -->
        <div class="filter-group" v-if="filterPlayerId">
          <label for="sec-player-filter">With / Against</label>
          <select id="sec-player-filter" v-model="filterSecondaryPlayerId" class="filter-select">
            <option value="">(Optional) Second Player</option>
            <option 
              v-for="player in sortedPlayers.filter(p => p.playerId !== filterPlayerId)" 
              :key="player.playerId" 
              :value="player.playerId"
            >
              {{ player.displayName }}
            </option>
          </select>
        </div>

        <!-- Relationship Toggle (Visible only when secondary player is selected) -->
        <div class="filter-group" v-if="filterPlayerId && filterSecondaryPlayerId">
          <label>Relationship</label>
          <div class="toggle-group">
            <button 
              class="toggle-btn" 
              :class="{ active: filterRelationship === 'teammate' }"
              @click="filterRelationship = 'teammate'"
            >
              Teammate
            </button>
            <button 
              class="toggle-btn" 
              :class="{ active: filterRelationship === 'opponent' }"
              @click="filterRelationship = 'opponent'"
            >
              Opponent
            </button>
          </div>
        </div>
        
        <button 
          v-if="filterEventId || filterPlayerId" 
          class="clear-filters-btn"
          @click="clearFilters"
        >
          Clear Filters
        </button>
      </div>
    </div>

    <LoadingSpinner v-if="isLoading" text="Loading history..." />

    <div v-else-if="error" class="error-message">{{ error }}</div>

    <EmptyState
      v-else-if="matches.length === 0"
      :icon="ChartBar"
      title="No match history yet"
      :description="filterEventId || filterPlayerId ? 'No matches found for the selected filters.' : 'Complete some events to see match history here.'"
    />

    <template v-else>
      <div class="history-content">
        <div v-for="event in matchesByEvent" :key="event.id" :id="`event-${event.id}`" class="event-section">
          <div class="event-header">
            <h2>{{ event.name }}</h2>
            <span class="event-date">{{ formatDate(event.date) }}</span>
          </div>

          <div class="matches-grid">
            <BaseCard v-for="match in event.matches" :key="match.eventId + match.roundIndex + match.courtIndex">
              <div class="match-card">
                <div class="match-header">
                  <span class="round-court">
                    Round {{ match.roundIndex + 1 }} • Court {{ match.courtIndex + 1 }}
                  </span>
                  <span class="result-badge" :class="match.result.toLowerCase()">
                    {{ getResultLabel(match.result) }}
                  </span>
                  <button v-if="isOrganizer" class="edit-btn" @click="openEditMatch(match)" title="Edit Score">
                    <Edit2 :size="14" /> Edit
                  </button>
                </div>

                <div class="match-teams">
                  <div 
                    class="team" 
                    :class="{
                      winner: match.result === 'TEAM1_WIN' && !filterPlayerId,
                      'player-win': filterPlayerId && getMatchOutcome(match) === 'win' && match.team1.includes(filteredPlayerName || ''),
                      'player-loss': filterPlayerId && getMatchOutcome(match) === 'loss' && match.team1.includes(filteredPlayerName || '')
                    }"
                  >
                    <div class="team-info">
                      <div class="team-names">
                        {{ match.team1.join(' & ') }}
                      </div>
                      <div class="team-elo" v-if="match.team1Elo">ELO: {{ match.team1Elo.toFixed(1) }}</div>
                    </div>
                    <div class="team-score">{{ match.scoreTeam1 ?? '-' }}</div>
                  </div>

                  <span class="vs">vs</span>

                  <div 
                    class="team" 
                    :class="{
                      winner: match.result === 'TEAM2_WIN' && !filterPlayerId,
                      'player-win': filterPlayerId && getMatchOutcome(match) === 'win' && match.team2.includes(filteredPlayerName || ''),
                      'player-loss': filterPlayerId && getMatchOutcome(match) === 'loss' && match.team2.includes(filteredPlayerName || '')
                    }"
                  >
                    <div class="team-info">
                      <div class="team-names">
                        {{ match.team2.join(' & ') }}
                      </div>
                      <div class="team-elo" v-if="match.team2Elo">ELO: {{ match.team2Elo.toFixed(1) }}</div>
                    </div>
                    <div class="team-score">{{ match.scoreTeam2 ?? '-' }}</div>
                  </div>
                </div>
              </div>
            </BaseCard>
          </div>
        </div>
      </div>
    </template>

    <!-- Edit Match Modal -->
    <Modal :open="showEditModal" title="Edit Match Score" @close="showEditModal = false">
      <div v-if="editingMatch" class="edit-form">
        <div class="edit-teams">
          <div class="edit-team">
            <span class="edit-team-label text-truncate">{{ editingMatch.team1.join(' & ') }}</span>
            <input type="number" v-model="editScore1" class="edit-input" placeholder="0" min="0" />
          </div>
          <span class="edit-vs">vs</span>
          <div class="edit-team">
            <span class="edit-team-label text-truncate">{{ editingMatch.team2.join(' & ') }}</span>
            <input type="number" v-model="editScore2" class="edit-input" placeholder="0" min="0" />
          </div>
        </div>
        <p class="edit-warning">
          <AlertTriangle :size="16" class="warning-icon" /> Updating this score will recalculate ratings for the entire group from this event onwards. This may take a moment.
        </p>
      </div>
      <template #footer>
        <BaseButton variant="secondary" @click="showEditModal = false">Cancel</BaseButton>
        <BaseButton :loading="isSavingEdit" @click="saveMatchEdit">Save & Recalculate</BaseButton>
      </template>
    </Modal>

    <!-- Mobile Bottom Navigation Bar -->
    <nav class="mobile-bottom-nav">
      <button class="bottom-nav-item" @click="router.push(`/groups/${groupId}/rankings`)">
        <Trophy :size="20" class="bottom-nav-icon" />
        <span class="bottom-nav-label">Rankings</span>
      </button>
      <button class="bottom-nav-item active">
        <ChartBar :size="20" class="bottom-nav-icon" />
        <span class="bottom-nav-label">History</span>
      </button>
      <button class="bottom-nav-item" :class="{ disabled: !myPlayer }" @click="myPlayer && router.push(`/groups/${groupId}/players/${myPlayer.id}`)">
        <Activity :size="20" class="bottom-nav-icon" />
        <span class="bottom-nav-label">Stats</span>
      </button>
      <button class="bottom-nav-item" @click="router.push(`/groups/${groupId}`)">
        <LayoutDashboard :size="20" class="bottom-nav-icon" />
        <span class="bottom-nav-label">Dash</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: var(--spacing-xl);
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
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 2rem;
  margin-bottom: var(--spacing-xs);
}

.subtitle {
  color: var(--color-text-secondary);
}

.error-message {
  padding: var(--spacing-lg);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error);
  text-align: center;
}

/* Filter Bar */
.filter-bar {
  display: flex;
  align-items: flex-end; /* Align to bottom so inputs and buttons line up */
  gap: var(--spacing-lg);
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-xl);
  flex-wrap: wrap;
}

.filter-icon {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  min-width: 80px;
  padding-bottom: 12px; /* Visual balance with labels */
}

.filter-controls {
  display: flex;
  align-items: flex-end; /* CRITICAL: Aligns buttons with inputs */
  gap: var(--spacing-lg);
  flex-wrap: wrap;
  flex: 1;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 180px;
}

.filter-group label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.toggle-group {
  display: flex;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 4px; /* Slightly more padding for the "pill" look */
  height: 42px; /* Match standard input height */
  box-sizing: border-box;
}

.toggle-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--spacing-md);
  font-size: 0.875rem; /* Match input text */
  font-weight: 500;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  border: none; /* Reset */
  background: transparent;
}

.toggle-btn:hover:not(.active) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.toggle-btn.active {
  background: var(--color-bg-card); /* White/Card bg for active pill */
  color: var(--color-primary);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.filter-select {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  cursor: pointer;
  height: 42px; /* Explicit height to match toggle */
  box-sizing: border-box;
  transition: all var(--transition-fast);
}

.filter-select:hover {
  border-color: var(--color-border-hover);
}

.filter-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.clear-filters-btn {
  padding: 0 var(--spacing-md); /* Use padding for width, height set by flex/box */
  height: 42px; /* Match input height */
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.clear-filters-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

/* History Content */
.history-content {
  width: 100%;
}

.event-section {
  margin-bottom: var(--spacing-2xl);
}

.event-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border);
}

.event-header h2 {
  font-size: 1.25rem;
}

.event-date {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.matches-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: var(--spacing-md);
}

.match-card {
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

.match-teams {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.team {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border: 2px solid transparent;
}

.team.winner {
  border-color: var(--color-success);
}

.team.player-win {
  border-color: var(--color-success);
  background: rgba(16, 185, 129, 0.1);
}

.team.player-loss {
  border-color: var(--color-error);
  background: rgba(239, 68, 68, 0.1);
}

.team-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.team-names {
  font-size: 0.875rem;
  font-weight: 500;
}

.team-elo {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.team-score {
  font-size: 1.25rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--color-primary);
}

.vs {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-weight: 600;
}

/* Edit Button */
.edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-left: 8px;
}

.edit-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

.edit-form {
  padding: 1rem 0;
}

.edit-teams {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.edit-team {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.edit-team-label {
  font-size: 0.875rem;
  font-weight: 500;
}

.text-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 1.25rem;
  text-align: center;
}

.edit-vs {
  font-weight: 600;
  color: var(--color-text-muted);
}

.edit-warning {
  font-size: 0.8rem;
  color: var(--color-warning);
  background: rgba(245, 158, 11, 0.1);
  padding: 0.75rem;
  border-radius: var(--radius-md);
  margin-top: 1rem;
}

@media (max-width: 768px) {
  .matches-grid {
    grid-template-columns: 1fr;
  }

  .match-teams {
    flex-direction: column;
  }

  .team {
    width: 100%;
  }

  /* Mobile Filter Styles */
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
    padding: var(--spacing-md);
  }

  .filter-icon {
    margin-bottom: var(--spacing-sm);
    padding-bottom: 0;
  }

  .filter-controls {
    flex-direction: column;
    align-items: stretch; /* Stack properly on mobile */
    gap: var(--spacing-md);
  }

  .filter-group {
    width: 100%;
    min-width: 0; /* Allow shrinking */
  }

  .filter-select,
  .toggle-group,
  .clear-filters-btn {
    width: 100%; /* Full width on mobile */
  }
}

.filter-icon {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  min-width: 80px;
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  flex-wrap: wrap;
  flex: 1;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 180px;
}

.filter-group label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.toggle-group {
  display: flex;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 2px;
}

.toggle-btn {
  flex: 1;
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.toggle-btn:hover:not(.active) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.toggle-btn.active {
  background: var(--color-primary);
  color: white;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.filter-select {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.filter-select:hover {
  border-color: var(--color-border-hover);
}

.filter-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.clear-filters-btn {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.clear-filters-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

/* History Content */
.history-content {
  width: 100%;
}

.event-section {
  margin-bottom: var(--spacing-2xl);
}

.event-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border);
}

.event-header h2 {
  font-size: 1.25rem;
}

.event-date {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.matches-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: var(--spacing-md);
}

.match-card {
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

.match-teams {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.team {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border: 2px solid transparent;
}

.team.winner {
  border-color: var(--color-success);
}

.team.player-win {
  border-color: var(--color-success);
  background: rgba(16, 185, 129, 0.1);
}

.team.player-loss {
  border-color: var(--color-error);
  background: rgba(239, 68, 68, 0.1);
}

.team-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.team-names {
  font-size: 0.875rem;
  font-weight: 500;
}

.team-elo {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.team-score {
  font-size: 1.25rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--color-primary);
}

.vs {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-weight: 600;
}

/* Edit Button */
.edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-left: 8px;
}

.edit-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

.edit-form {
  padding: 1rem 0;
}

.edit-teams {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.edit-team {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.edit-team-label {
  font-size: 0.875rem;
  font-weight: 500;
}

.text-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 1.25rem;
  text-align: center;
}

.edit-vs {
  font-weight: 600;
  color: var(--color-text-muted);
}

.edit-warning {
  font-size: 0.8rem;
  color: var(--color-warning);
  background: rgba(245, 158, 11, 0.1);
  padding: 0.75rem;
  border-radius: var(--radius-md);
  margin-top: 1rem;
}

@media (max-width: 768px) {
  .matches-grid {
    grid-template-columns: 1fr;
  }

  .match-teams {
    flex-direction: column;
  }

  .team {
    width: 100%;
  }

  .filter-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-controls {
    flex-direction: column;
  }

  .filter-group {
    width: 100%;
  }
}

/* Per-page bottom nav hidden - using global nav from AppLayout */
.mobile-bottom-nav {
  display: none !important;
}

@media (max-width: 768px) {
  .history-page {
    padding-bottom: 100px;
  }

  .mobile-bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(255, 255, 255, 0.85);
    background: var(--color-bg-glass, rgba(255, 255, 255, 0.8));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-top: 1px solid rgba(0, 0, 0, 0.05);
    display: flex;
    justify-content: space-around;
    padding: 12px 16px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    z-index: 100;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.03);
  }

  @media (prefers-color-scheme: dark) {
    .mobile-bottom-nav {
      background: rgba(30, 30, 30, 0.8);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
  }

  .bottom-nav-item {
    background: none;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: var(--color-text-secondary);
    padding: 4px 12px;
    border-radius: 12px;
    transition: all 0.2s ease;
    min-width: 60px;
    flex: 1;
  }

  .bottom-nav-item.active {
    color: var(--color-primary);
  }

  .bottom-nav-item:active {
    transform: scale(0.95);
    background: rgba(16, 185, 129, 0.1);
  }

  .bottom-nav-item.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .bottom-nav-label {
    font-size: 0.625rem;
    font-weight: 500;
    text-transform: uppercase;
  }
}
</style>
