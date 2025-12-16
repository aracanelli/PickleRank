<script setup lang="ts">
import { 
  ArrowLeft, Settings, Plus, Trophy, ChartBar, Upload, Target, 
  Users, TrendingUp, TrendingDown, Calendar, Download, CheckCircle 
} from 'lucide-vue-next'
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { groupsApi } from '../services/groups.api'
import { eventsApi } from '@/app/features/events/services/events.api'
import type { GroupDto, GroupPlayerDto, EventListItemDto } from '@/app/core/models/dto'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import EmptyState from '@/app/core/ui/components/EmptyState.vue'
import Modal from '@/app/core/ui/components/Modal.vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const currentUserId = computed(() => authStore.userId)

const router = useRouter()
const route = useRoute()
const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const players = ref<GroupPlayerDto[]>([])
const pendingEvents = ref<EventListItemDto[]>([])
const isLoading = ref(true)
const isLoadingEvents = ref(false)
const error = ref('')

const showImportModal = ref(false)
const importFile = ref<File | null>(null)
const isImporting = ref(false)
const importResult = ref<{ eventsCreated: number; gamesImported: number } | null>(null)

onMounted(async () => {
  await Promise.all([loadGroup(), loadPlayers(), loadPendingEvents()])
})

async function loadGroup() {
  try {
    group.value = await groupsApi.get(groupId.value)
  } catch (e: any) {
    error.value = e.message || 'Failed to load group'
  }
}

async function loadPlayers() {
  isLoading.value = true
  try {
    const groupPlayersRes = await groupsApi.getPlayers(groupId.value)
    players.value = groupPlayersRes.players
  } catch (e: any) {
    error.value = e.message || 'Failed to load players'
  } finally {
    isLoading.value = false
  }
}

// Compute permanent and sub counts
const permanentPlayers = computed(() => players.value.filter(p => p.membershipType === 'PERMANENT'))
const subPlayers = computed(() => players.value.filter(p => p.membershipType === 'SUB'))

function formatRating(rating: number): string {
  return rating.toFixed(1)
}

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

async function loadPendingEvents() {
  isLoadingEvents.value = true
  try {
    const allEvents = await eventsApi.list(groupId.value)
    // Filter out completed events - only show DRAFT, GENERATED, IN_PROGRESS
    pendingEvents.value = allEvents.events.filter(
      e => e.status !== 'COMPLETED'
    )
  } catch (e: any) {
    console.error('Failed to load pending events:', e)
  } finally {
    isLoadingEvents.value = false
  }
}

function continueEvent(event: EventListItemDto) {
  router.push(`/events/${event.id}`)
}

async function deleteEvent(event: EventListItemDto) {
  if (!confirm(`Delete event "${event.name || 'Unnamed Event'}"? This cannot be undone.`)) {
    return
  }
  
  try {
    await eventsApi.delete(event.id)
    await loadPendingEvents()
  } catch (e: any) {
    error.value = e.message || 'Failed to delete event'
  }
}

function formatEventDate(dateStr?: string): string {
  if (!dateStr) return 'No date'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'DRAFT': return 'Draft'
    case 'GENERATED': return 'Generated'
    case 'IN_PROGRESS': return 'In Progress'
    default: return status
  }
}

async function downloadTemplate() {
  try {
    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()
    const token = await authStore.getToken()
    
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/groups/${groupId.value}/history/import/template`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Failed to download template' }))
      throw new Error(errorData.detail || `HTTP ${response.status}`)
    }
    
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'history_import_template.csv'
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  } catch (e: any) {
    error.value = e.message || 'Failed to download template'
  }
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    importFile.value = target.files[0]
  }
}

async function importHistory() {
  if (!importFile.value) return
  
  isImporting.value = true
  error.value = ''
  importResult.value = null
  
  try {
    const formData = new FormData()
    formData.append('file', importFile.value)
    
    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()
    const token = await authStore.getToken()
    
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/groups/${groupId.value}/history/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Import failed' }))
      throw new Error(errorData.detail || `HTTP ${response.status}`)
    }
    
    const result = await response.json()
    importResult.value = result
    await loadPendingEvents()
  } catch (e: any) {
    error.value = e.message || 'Failed to import history'
  } finally {
    isImporting.value = false
  }
}

function closeImportModal() {
  showImportModal.value = false
  importFile.value = null
  importResult.value = null
  error.value = '' // Clear error when closing modal
}

function viewPlayerHistory(player: GroupPlayerDto) {
  router.push(`/groups/${groupId.value}/history?playerId=${player.playerId}`)
}
</script>

<template>
  <div class="group-detail container">
    <LoadingSpinner v-if="isLoading && !group" text="Loading group..." />

    <template v-else-if="group">
      <!-- Header -->
      <div class="page-header">
        <div>
          <router-link to="/groups" class="back-link">
            <ArrowLeft :size="16" /> Back to Groups
          </router-link>
          <h1>{{ group.name }}</h1>
          <p class="subtitle">
            <template v-if="group.settings.ratingSystem === 'CATCH_UP'">Catch-Up Mode</template>
            <template v-else-if="group.settings.ratingSystem === 'RACS_ELO'">Rac's ELO</template>
            <template v-else>Serious ELO</template>
             • {{ players.length }} players
          </p>
        </div>
        <!-- Desktop header actions -->
        <div class="header-actions desktop-only" v-if="isOrganizer">
          <BaseButton variant="secondary" @click="router.push(`/groups/${groupId}/settings`)">
            <Settings :size="16" /> Settings
          </BaseButton>
          <BaseButton @click="router.push(`/groups/${groupId}/events/new`)">
            <Plus :size="16" /> New Event
          </BaseButton>
        </div>
        <!-- Mobile header actions (icon buttons) -->
        <div class="header-actions mobile-only" v-if="isOrganizer">
          <button class="mobile-icon-btn" @click="router.push(`/groups/${groupId}/settings`)" title="Settings">
            <Settings :size="20" />
          </button>
          <button class="mobile-icon-btn primary" @click="router.push(`/groups/${groupId}/events/new`)" title="New Event">
            <Plus :size="20" />
          </button>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <BaseCard clickable @click="router.push(`/groups/${groupId}/rankings`)">
          <div class="quick-action">
            <div class="qa-icon"><Trophy :size="32" /></div>
            <span class="qa-label">Rankings</span>
          </div>
        </BaseCard>
        <BaseCard clickable @click="router.push(`/groups/${groupId}/history`)">
          <div class="quick-action">
            <div class="qa-icon"><ChartBar :size="32" /></div>
            <span class="qa-label">History</span>
          </div>
        </BaseCard>
        <BaseCard v-if="isOrganizer" clickable @click="showImportModal = true">
          <div class="quick-action">
            <div class="qa-icon"><Upload :size="32" /></div>
            <span class="qa-label">Import History</span>
          </div>
        </BaseCard>
        <BaseCard v-if="isOrganizer" clickable @click="router.push(`/groups/${groupId}/events/new`)">
          <div class="quick-action">
            <div class="qa-icon"><Target :size="32" /></div>
            <span class="qa-label">New Event</span>
          </div>
        </BaseCard>
      </div>

      <!-- Players Section -->
      <section class="section">
        <div class="section-header">
          <div class="section-title">
            <h2>Players</h2>
            <div class="player-counts">
              <span class="count-badge permanent">{{ permanentPlayers.length }} Permanent</span>
              <span class="count-badge sub">{{ subPlayers.length }} Sub</span>
            </div>
          </div>
          <div class="section-actions" v-if="isOrganizer">
            <BaseButton size="sm" @click="router.push(`/groups/${groupId}/players/manage`)">
              Manage Players
            </BaseButton>
          </div>
        </div>

        <EmptyState
          v-if="permanentPlayers.length === 0"
          :icon="Users"
          title="No permanent players yet"
          description="Add permanent players to your group to start creating events."
        >
          <template #action>
            <BaseButton @click="router.push(`/groups/${groupId}/players/manage`)">
              Manage Players
            </BaseButton>
          </template>
        </EmptyState>

        <div v-else class="players-list">
          <div v-for="player in permanentPlayers" :key="player.id" class="player-item clickable" @click="viewPlayerHistory(player)">
            <div class="player-info">
              <div class="player-avatar">
                {{ player.displayName[0] }}
              </div>
              <div class="player-details">
                <div class="player-name-row">
                  <span class="player-name">{{ player.displayName }}</span>
                  <span v-if="player.userId === currentUserId" class="me-indicator">(Me)</span>
                  <span v-if="player.role === 'ORGANIZER'" class="role-badge organizer">Organizer</span>
                </div>
                <span class="player-stats">
                  {{ player.gamesPlayed }} games • {{ (player.winRate * 100).toFixed(0) }}% win rate
                </span>
              </div>
            </div>
            <div class="player-rating">
              <div class="rating-row">
                <span class="rating-value">{{ formatRating(player.rating) }}</span>
                <span v-if="player.ratingDelta && player.ratingDelta > 0" class="rating-delta positive">
                  <TrendingUp :size="12" /> +{{ player.ratingDelta.toFixed(1) }}
                </span>
                <span v-else-if="player.ratingDelta && player.ratingDelta < 0" class="rating-delta negative">
                  <TrendingDown :size="12" /> {{ player.ratingDelta.toFixed(1) }}
                </span>
              </div>
              <span class="rating-label">Rating</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Pending Events Section -->
      <section class="section">
        <div class="section-header">
          <div class="section-title">
            <h2>Pending Events</h2>
            <span v-if="pendingEvents.length > 0" class="count-badge">
              {{ pendingEvents.length }}
            </span>
          </div>
  
        </div>

        <EmptyState
          v-if="!isLoadingEvents && pendingEvents.length === 0"
          :icon="Calendar"
          title="No pending events"
          description="Create a new event to start organizing games."
        >
          <template #action>
            <BaseButton @click="router.push(`/groups/${groupId}/events/new`)">
              Create First Event
            </BaseButton>
          </template>
        </EmptyState>

        <LoadingSpinner v-if="isLoadingEvents" text="Loading events..." />

        <div v-else-if="pendingEvents.length > 0" class="events-list">
          <BaseCard v-for="event in pendingEvents" :key="event.id" class="event-card">
            <div class="event-card-content">
              <div class="event-info">
                <div class="event-name-row">
                  <h3 class="event-name">{{ event.name || 'Unnamed Event' }}</h3>
                  <span class="status-badge" :class="event.status.toLowerCase()">
                    {{ getStatusLabel(event.status) }}
                  </span>
                </div>
                <div class="event-meta">
                  <span>{{ formatEventDate(event.startsAt) }}</span>
                  <span>•</span>
                  <span>{{ event.courts }} courts</span>
                  <span>•</span>
                  <span>{{ event.rounds }} rounds</span>
                </div>
              </div>
              <div class="event-actions">
                <BaseButton size="sm" @click="continueEvent(event)">
                  Continue
                </BaseButton>
                <BaseButton size="sm" variant="secondary" @click="deleteEvent(event)">
                  Delete
                </BaseButton>
              </div>
            </div>
          </BaseCard>
        </div>
      </section>
    </template>

    <!-- Import History Modal -->
    <Modal :open="showImportModal" title="Import History" @close="closeImportModal">
      <div class="import-content">
        <div class="import-instructions">
          <p>Import historical game data from a CSV file. Download the template to see the required format.</p>
          <BaseButton variant="secondary" size="sm" @click="downloadTemplate">
            <Download :size="16" /> Download Template
          </BaseButton>
        </div>

        <div v-if="error" class="import-error">
          <strong>Error:</strong>
          <pre>{{ error }}</pre>
        </div>

        <div v-if="importResult" class="import-success">
          <div class="success-header">
            <CheckCircle :size="24" class="success-icon" />
            <h4>Import Successful!</h4>
          </div>
          <p>{{ importResult.eventsCreated }} events created</p>
          <p>{{ importResult.gamesImported }} games imported</p>
        </div>

        <div v-else class="import-form">
          <div class="form-group">
            <label class="label">Select CSV File</label>
            <input
              type="file"
              accept=".csv"
              @change="handleFileSelect"
              class="file-input"
            />
            <p v-if="importFile" class="file-name">{{ importFile.name }}</p>
          </div>
        </div>
      </div>
      <template #footer>
        <BaseButton variant="secondary" @click="closeImportModal">Cancel</BaseButton>
        <BaseButton
          :loading="isImporting"
          :disabled="!importFile"
          @click="importHistory"
        >
          Import
        </BaseButton>
      </template>
    </Modal>

    <!-- Mobile Bottom Navigation Bar -->
    <nav class="mobile-bottom-nav" v-if="group">
      <button class="bottom-nav-item" @click="router.push(`/groups/${groupId}/rankings`)">
        <Trophy :size="20" class="bottom-nav-icon" />
        <span class="bottom-nav-label">Rankings</span>
      </button>
      <button class="bottom-nav-item" @click="router.push(`/groups/${groupId}/history`)">
        <ChartBar :size="20" class="bottom-nav-icon" />
        <span class="bottom-nav-label">History</span>
      </button>
      <button v-if="isOrganizer" class="bottom-nav-item" @click="showImportModal = true">
        <Upload :size="20" class="bottom-nav-icon" />
        <span class="bottom-nav-label">Import</span>
      </button>
      <button v-if="isOrganizer" class="bottom-nav-item" @click="router.push(`/groups/${groupId}/events/new`)">
        <Target :size="20" class="bottom-nav-icon" />
        <span class="bottom-nav-label">New Event</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-xl);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  margin-bottom: var(--spacing-sm);
}

.back-link:hover {
  color: var(--color-primary);
}

.page-header h1 {
  font-size: 2rem;
  margin-bottom: var(--spacing-xs);
}

.subtitle {
  color: var(--color-text-secondary);
}

.header-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
}

.quick-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  text-align: center;
}

.qa-icon {
  font-size: 2rem;
}

.qa-label {
  font-weight: 500;
  color: var(--color-text-secondary);
}

.section {
  margin-bottom: var(--spacing-xl);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
  flex-wrap: wrap;
  gap: var(--spacing-md);
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.section-title h2 {
  font-size: 1.25rem;
}

.player-counts {
  display: flex;
  gap: var(--spacing-sm);
}

.count-badge {
  font-size: 0.75rem;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
  font-weight: 500;
}

.count-badge.permanent {
  background: rgba(16, 185, 129, 0.1);
  color: var(--color-primary);
}

.count-badge.sub {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.section-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.empty-actions {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  justify-content: center;
}

.players-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.player-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.player-item.clickable {
  cursor: pointer;
  transition: all var(--transition-fast);
}

.player-item.clickable:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.player-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex: 1;
}

.player-avatar {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-full);
  font-weight: 600;
}

.player-avatar.sub {
  background: #f59e0b;
}

.player-details {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.player-name-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.player-name {
  font-weight: 500;
}

.membership-badge {
  font-size: 0.625rem;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.membership-badge.permanent {
  background: rgba(16, 185, 129, 0.15);
  color: var(--color-primary);
}

.membership-badge.permanent:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.25);
}

.membership-badge.sub {
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
}

.membership-badge.sub:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.25);
}

.membership-badge:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.player-stats {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.player-rating {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 var(--spacing-lg);
}

.rating-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-primary);
  font-family: var(--font-mono);
}

.rating-label {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.rating-row {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-xs);
}

.rating-delta {
  font-size: 0.75rem;
  font-weight: 600;
  font-family: var(--font-mono);
}

.rating-delta.positive {
  color: var(--color-success, #10b981);
}

.rating-delta.negative {
  color: var(--color-error, #ef4444);
}

.remove-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.remove-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-error);
}

.skill-level-select {
  height: 32px;
  padding: 0 var(--spacing-sm);
  border: 1px solid #f59e0b;
  border-radius: var(--radius-md);
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  margin-right: var(--spacing-xs);
}

.skill-level-select:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.2);
}

.skill-level-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-group {
  margin-bottom: var(--spacing-md);
}

.label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xs);
}

.select {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 1rem;
}

.select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.membership-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm);
}

.membership-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.membership-option:hover {
  border-color: var(--color-text-muted);
}

.membership-option.active {
  border-color: var(--color-primary);
  background: rgba(16, 185, 129, 0.05);
}

.option-indicator {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
}

.option-indicator.permanent {
  background: var(--color-primary);
}

.option-indicator.sub {
  background: #f59e0b;
}

.option-label {
  font-weight: 600;
  font-size: 0.875rem;
}

.option-desc {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.empty-players {
  text-align: center;
  padding: var(--spacing-lg);
  color: var(--color-text-secondary);
}

.empty-players a {
  display: inline-block;
  margin-top: var(--spacing-sm);
}

/* Import Modal */
.import-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.import-instructions {
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.import-instructions p {
  margin-bottom: var(--spacing-md);
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.import-success {
  padding: var(--spacing-md);
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid var(--color-success);
  border-radius: var(--radius-md);
}

.import-success h4 {
  color: var(--color-success);
  margin-bottom: var(--spacing-sm);
}

.import-success p {
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

.file-input {
  width: 100%;
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  cursor: pointer;
}

.file-name {
  margin-top: var(--spacing-xs);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.import-error {
  padding: var(--spacing-md);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error);
}

.import-error strong {
  display: block;
  margin-bottom: var(--spacing-xs);
}

.import-error pre {
  margin: 0;
  font-size: 0.875rem;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.event-card {
  transition: all var(--transition-fast);
}

.event-card:hover {
  border-color: var(--color-primary);
}

.event-card-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.event-info {
  flex: 1;
  min-width: 200px;
}

.event-name-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
  flex-wrap: wrap;
}

.event-name {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.status-badge {
  font-size: 0.75rem;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.draft {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.status-badge.generated {
  background: rgba(59, 130, 246, 0.2);
  color: var(--color-info);
}

.status-badge.in_progress {
  background: rgba(245, 158, 11, 0.2);
  color: var(--color-warning);
}

.event-meta {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.event-actions {
  display: flex;
  gap: var(--spacing-sm);
  flex-shrink: 0;
}

/* Responsive visibility utilities */
.desktop-only {
  display: flex;
}

.mobile-only {
  display: none;
}

/* Mobile icon buttons */
.mobile-icon-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 1.25rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.mobile-icon-btn:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-light);
}

.mobile-icon-btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.mobile-icon-btn.primary:hover {
  background: var(--color-primary-hover);
}

/* Mobile bottom navigation bar */
.mobile-bottom-nav {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-bg-card);
  border-top: 1px solid var(--color-border);
  padding: var(--spacing-sm) var(--spacing-md);
  padding-bottom: calc(var(--spacing-sm) + env(safe-area-inset-bottom, 0));
  z-index: 100;
  justify-content: space-around;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
}

.bottom-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--spacing-sm);
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  min-width: 64px;
}

.bottom-nav-item:hover,
.bottom-nav-item:active {
  color: var(--color-primary);
}

.bottom-nav-icon {
  font-size: 1.5rem;
}

.bottom-nav-label {
  font-size: 0.625rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

@media (max-width: 768px) {
  /* Show/hide responsive elements */
  .desktop-only {
    display: none !important;
  }

  .mobile-only {
    display: flex !important;
  }

  .mobile-bottom-nav {
    display: flex;
  }

  /* Hide quick actions on mobile - they're in bottom nav now */
  .quick-actions {
    display: none;
  }

  /* Add padding at bottom for fixed nav bar */
  .group-detail {
    padding-bottom: 100px;
  }

  .page-header {
    flex-direction: row;
    gap: var(--spacing-md);
    align-items: flex-start;
  }

  .page-header > div:first-child {
    flex: 1;
  }

  .header-actions.mobile-only {
    gap: var(--spacing-xs);
    flex-shrink: 0;
  }

  .section-header {
    flex-direction: column;
    align-items: stretch;
  }

  .section-actions {
    justify-content: stretch;
  }

  .section-actions button {
    flex: 1;
  }

  .event-card-content {
    flex-direction: column;
    align-items: stretch;
  }

  .event-actions {
    width: 100%;
  }

  .event-actions button {
    flex: 1;
  }
}
.role-badge {
  font-size: 0.625rem;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  margin-left: var(--spacing-xs);
}

.role-badge.organizer {
  background: rgba(124, 58, 237, 0.15);
  color: #7c3aed;
}

.me-indicator {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-left: var(--spacing-xs);
  font-weight: normal;
}
</style>



