<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { rankingsApi } from '../services/rankings.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { eventsApi } from '@/app/features/events/services/events.api'
import type { MatchHistoryEntryDto, GroupDto } from '@/app/core/models/dto'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import EmptyState from '@/app/core/ui/components/EmptyState.vue'
import Modal from '@/app/core/ui/components/Modal.vue'

const route = useRoute()
const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const matches = ref<MatchHistoryEntryDto[]>([])
const isLoading = ref(true)
const error = ref('')
const selectedEventId = ref<string | null>(null)
const showEventDetail = ref(false)
const sidebarCollapsed = ref(false)

onMounted(async () => {
  await Promise.all([loadGroup(), loadHistory()])
})

async function loadGroup() {
  try {
    group.value = await groupsApi.get(groupId.value)
  } catch (e: any) {
    error.value = e.message
  }
}

async function loadHistory() {
  isLoading.value = true
  try {
    const response = await rankingsApi.getHistory(groupId.value)
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
  const events: Map<string, { id: string; name: string; date: string; matches: MatchHistoryEntryDto[] }> = new Map()
  
  for (const match of matches.value) {
    if (!events.has(match.eventId)) {
      events.set(match.eventId, {
        id: match.eventId,
        name: match.eventName || 'Event',
        date: match.date,
        matches: []
      })
    }
    events.get(match.eventId)!.matches.push(match)
  }
  
  // Sort by date (newest first)
  return Array.from(events.values()).sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })
})

const selectedEvent = computed(() => {
  if (!selectedEventId.value) return null
  return matchesByEvent.value.find(e => e.id === selectedEventId.value) || null
})

function selectEvent(eventId: string) {
  selectedEventId.value = eventId
  showEventDetail.value = true
  
  // Scroll to event section
  const element = document.getElementById(`event-${eventId}`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function closeEventDetail() {
  showEventDetail.value = false
  selectedEventId.value = null
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
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
      scoreTeam1: editScore1.value,
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
          ← Back to {{ group?.name || 'Group' }}
        </router-link>
        <h1>📊 Match History</h1>
        <p class="subtitle">All completed games in this group</p>
      </div>
    </div>

    <LoadingSpinner v-if="isLoading" text="Loading history..." />

    <div v-else-if="error" class="error-message">{{ error }}</div>

    <EmptyState
      v-else-if="matches.length === 0"
      icon="📊"
      title="No match history yet"
      description="Complete some events to see match history here."
    />

    <template v-else>
      <div class="history-layout">
        <!-- Timeline Sidebar -->
        <aside class="timeline-sidebar" :class="{ collapsed: sidebarCollapsed }">
          <div class="sidebar-header">
            <h3>Timeline</h3>
            <button class="toggle-sidebar-btn" @click="toggleSidebar">
              {{ sidebarCollapsed ? '▶' : '◀' }}
            </button>
          </div>
          <div class="timeline-list">
            <button
              v-for="event in matchesByEvent"
              :key="event.id"
              class="timeline-item"
              :class="{ active: selectedEventId === event.id }"
              @click="selectEvent(event.id)"
            >
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <div class="timeline-event-name">{{ event.name }}</div>
                <div class="timeline-event-date">{{ formatDate(event.date) }}</div>
                <div class="timeline-event-count">{{ event.matches.length }} games</div>
              </div>
            </button>
          </div>
        </aside>

        <!-- Main Content -->
        <main class="history-content">
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
                <button class="edit-btn" @click="openEditMatch(match)" title="Edit Score">
                  Edit
                </button>
              </div>

              <div class="match-teams">
                <div class="team" :class="{ winner: match.result === 'TEAM1_WIN' }">
                  <div class="team-info">
                    <div class="team-names">
                      {{ match.team1.join(' & ') }}
                    </div>
                    <div class="team-elo" v-if="match.team1Elo">ELO: {{ match.team1Elo.toFixed(1) }}</div>
                  </div>
                  <div class="team-score">{{ match.scoreTeam1 ?? '-' }}</div>
                </div>

                <span class="vs">vs</span>

                <div class="team" :class="{ winner: match.result === 'TEAM2_WIN' }">
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
        </main>
      </div>
    </template>

    <!-- Event Detail Modal -->
    <Modal :open="showEventDetail && !!selectedEvent" title="Event Details" @close="closeEventDetail">
      <div v-if="selectedEvent" class="event-detail-content">
        <div class="event-detail-header">
          <h3>{{ selectedEvent.name }}</h3>
          <p class="event-detail-date">{{ formatDate(selectedEvent.date) }}</p>
        </div>
        <div class="event-detail-stats">
          <div class="stat-item">
            <span class="stat-label">Games</span>
            <span class="stat-value">{{ selectedEvent.matches.length }}</span>
          </div>
        </div>
        <div class="event-detail-matches">
          <h4>Games</h4>
          <div class="matches-list">
            <div v-for="match in selectedEvent.matches" :key="`${match.roundIndex}-${match.courtIndex}`" class="match-item">
              <div class="match-info">
                <span class="match-round-court">
                  Round {{ match.roundIndex + 1 }} • Court {{ match.courtIndex + 1 }}
                </span>
                <span class="match-result" :class="match.result.toLowerCase()">
                  {{ getResultLabel(match.result) }}
                </span>
              </div>
              <div class="match-teams-compact">
                <span class="team-compact">{{ match.team1.join(' & ') }}</span>
                <span class="score-compact">{{ match.scoreTeam1 ?? '-' }}</span>
                <span class="vs-compact">vs</span>
                <span class="score-compact">{{ match.scoreTeam2 ?? '-' }}</span>
                <span class="team-compact">{{ match.team2.join(' & ') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>

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
          ⚠️ Updating this score will recalculate ratings for the entire group from this event onwards. This may take a moment.
        </p>
      </div>
      <template #footer>
        <BaseButton variant="secondary" @click="showEditModal = false">Cancel</BaseButton>
        <BaseButton :loading="isSavingEdit" @click="saveMatchEdit">Save & Recalculate</BaseButton>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: var(--spacing-xl);
}

.back-link {
  display: inline-block;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  margin-bottom: var(--spacing-sm);
}

.page-header h1 {
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

/* Timeline Sidebar */
.history-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: var(--spacing-xl);
  align-items: start;
}

.timeline-sidebar {
  position: sticky;
  top: var(--spacing-lg);
  max-height: calc(100vh - var(--spacing-xl));
  overflow-y: auto;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  transition: all var(--transition-fast);
}

.timeline-sidebar.collapsed {
  grid-column: span 1;
  width: 60px;
  padding: var(--spacing-sm);
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border);
}

.sidebar-header h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.timeline-sidebar.collapsed .sidebar-header h3 {
  display: none;
}

.toggle-sidebar-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.875rem;
  padding: var(--spacing-xs);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.toggle-sidebar-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.timeline-sidebar.collapsed .timeline-list {
  align-items: center;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: none;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
  width: 100%;
}

.timeline-sidebar.collapsed .timeline-item {
  justify-content: center;
  padding: var(--spacing-xs);
}

.timeline-item:hover {
  background: var(--color-bg-secondary);
}

.timeline-item.active {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid var(--color-primary);
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  flex-shrink: 0;
  margin-top: 4px;
}

.timeline-item.active .timeline-dot {
  background: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

.timeline-content {
  flex: 1;
  min-width: 0;
}

.timeline-sidebar.collapsed .timeline-content {
  display: none;
}

.timeline-event-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-event-date {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-xs);
}

.timeline-event-count {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.history-content {
  min-width: 0;
}

/* Event Detail Modal */
.event-detail-content {
  max-height: 70vh;
  overflow-y: auto;
}

.event-detail-header {
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
}

.event-detail-header h3 {
  font-size: 1.25rem;
  margin-bottom: var(--spacing-xs);
}

.event-detail-date {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.event-detail-stats {
  display: flex;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-primary);
  font-family: var(--font-mono);
}

.event-detail-matches h4 {
  font-size: 1rem;
  margin-bottom: var(--spacing-md);
}

.matches-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.match-item {
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.match-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.match-round-court {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-weight: 600;
}

.match-result {
  font-size: 0.75rem;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.match-result.team1_win,
.match-result.team2_win {
  background: rgba(34, 197, 94, 0.1);
  color: var(--color-success);
}

.match-result.tie {
  background: rgba(245, 158, 11, 0.1);
  color: var(--color-warning);
}

.match-teams-compact {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  font-size: 0.875rem;
}

.team-compact {
  font-weight: 500;
  flex: 1;
  min-width: 100px;
}

.score-compact {
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--color-primary);
  min-width: 30px;
  text-align: center;
}

.vs-compact {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

@media (max-width: 1024px) {
  .history-layout {
    grid-template-columns: 1fr;
  }

  .timeline-sidebar {
    position: relative;
    top: 0;
    max-height: 300px;
  }

  .timeline-sidebar.collapsed {
    width: 100%;
    max-height: 60px;
  }
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
}
</style>

<style scoped>
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


</style>




