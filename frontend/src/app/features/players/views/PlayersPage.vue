<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { playersApi } from '../services/players.api'
import type { PlayerDto } from '@/app/core/models/dto'
import { Users, Search, Plus, FileText, Link, UserPlus, Copy, Check } from 'lucide-vue-next'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import BaseInput from '@/app/core/ui/components/BaseInput.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import EmptyState from '@/app/core/ui/components/EmptyState.vue'
import Modal from '@/app/core/ui/components/Modal.vue'
import BulkPlayerCreateModal from '../components/BulkPlayerCreateModal.vue'

const players = ref<PlayerDto[]>([])
const isLoading = ref(true)
const error = ref('')
const searchQuery = ref('')

// Single player create
const showCreateModal = ref(false)
const newPlayerName = ref('')
const newPlayerNotes = ref('')
const isCreating = ref(false)

// Bulk create
const showBulkModal = ref(false)

// Invite logic
const showInviteModal = ref(false)
const inviteLink = ref('')
const invitingPlayerName = ref('')
const copySuccess = ref(false)
const copyError = ref('')
let copySuccessTimeoutId: number | null = null

onMounted(async () => {
  await loadPlayers()
})

async function loadPlayers() {
  isLoading.value = true
  error.value = ''
  try {
    const response = await playersApi.list(searchQuery.value || undefined)
    players.value = response.players
  } catch (e: any) {
    error.value = e.message || 'Failed to load players'
  } finally {
    isLoading.value = false
  }
}

async function createPlayer() {
  if (!newPlayerName.value.trim()) return

  isCreating.value = true
  try {
    await playersApi.create({
      displayName: newPlayerName.value,
      notes: newPlayerNotes.value || undefined
    })
    showCreateModal.value = false
    newPlayerName.value = ''
    newPlayerNotes.value = ''
    await loadPlayers()
  } catch (e: any) {
    error.value = e.message || 'Failed to create player'
  } finally {
    isCreating.value = false
  }
}

async function generateInvite(player: PlayerDto) {
  try {
    const token = await playersApi.generateInvite(player.id)
    const baseUrl = window.location.origin
    inviteLink.value = `${baseUrl}/link-player?token=${encodeURIComponent(token)}`
    invitingPlayerName.value = player.displayName
    showInviteModal.value = true
    copySuccess.value = false
  } catch (e: any) {
    error.value = e.message || 'Failed to generate invite'
  }
}

async function copyLink() {
  // Clear any pending timeout to avoid stale state updates
  if (copySuccessTimeoutId !== null) {
    clearTimeout(copySuccessTimeoutId)
    copySuccessTimeoutId = null
  }
  
  copyError.value = ''
  
  try {
    // Check if modern clipboard API is available (requires secure context)
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(inviteLink.value)
    } else {
      // Fallback for older browsers or insecure contexts
      const textArea = document.createElement('textarea')
      textArea.value = inviteLink.value
      // Prevent scrolling to bottom of page
      textArea.style.position = 'fixed'
      textArea.style.top = '0'
      textArea.style.left = '0'
      textArea.style.width = '2em'
      textArea.style.height = '2em'
      textArea.style.padding = '0'
      textArea.style.border = 'none'
      textArea.style.outline = 'none'
      textArea.style.boxShadow = 'none'
      textArea.style.background = 'transparent'
      // Ensure it's off-screen for accessibility
      textArea.setAttribute('aria-hidden', 'true')
      textArea.setAttribute('tabindex', '-1')
      
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      
      try {
        const successful = document.execCommand('copy')
        if (!successful) {
          throw new Error('execCommand copy failed')
        }
      } finally {
        document.body.removeChild(textArea)
      }
    }
    
    copySuccess.value = true
    copySuccessTimeoutId = window.setTimeout(() => {
      copySuccess.value = false
      copySuccessTimeoutId = null
    }, 2000)
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    console.error('Failed to copy link:', errorMessage, e)
    copySuccess.value = false
    copyError.value = 'Failed to copy link. Please copy manually.'
    
    // Clear error after a delay
    copySuccessTimeoutId = window.setTimeout(() => {
      copyError.value = ''
      copySuccessTimeoutId = null
    }, 3000)
  }
}

onBeforeUnmount(() => {
  // Clean up timeout to prevent state updates after unmount
  if (copySuccessTimeoutId !== null) {
    clearTimeout(copySuccessTimeoutId)
    copySuccessTimeoutId = null
  }
  if (searchTimeout !== null) {
    clearTimeout(searchTimeout)
    searchTimeout = null
  }
})

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

let searchTimeout: number | null = null
function handleSearch() {
  if (searchTimeout !== null) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = window.setTimeout(() => loadPlayers(), 300)
}


</script>

<template>
  <div class="players-page container">
    <div class="page-header">
      <div>
        <h1>Players</h1>
        <p class="subtitle">Manage your global player roster</p>
      </div>
      <div class="header-actions">
        <BaseButton variant="secondary" @click="showBulkModal = true">
          <FileText :size="16" /> Bulk Add
        </BaseButton>
        <BaseButton @click="showCreateModal = true">
          <Plus :size="16" /> New Player
        </BaseButton>
      </div>
    </div>

    <!-- Search -->
    <div class="search-bar">
      <BaseInput
        v-model="searchQuery"
        type="search"
        placeholder="Search players..."
        @input="handleSearch"
      />
    </div>

    <LoadingSpinner v-if="isLoading" text="Loading players..." />

    <div v-else-if="error" class="error-message">
      {{ error }}
    </div>

    <EmptyState
      v-else-if="players.length === 0 && !searchQuery"
      :icon="Users"
      title="No players yet"
      description="Create players here and add them to your groups."
    >
      <template #action>
        <div class="empty-actions">
          <BaseButton variant="secondary" @click="showBulkModal = true">Bulk Add Players</BaseButton>
          <BaseButton @click="showCreateModal = true">Create Your First Player</BaseButton>
        </div>
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="players.length === 0 && searchQuery"
      :icon="Search"
      title="No players found"
      description="Try a different search term."
    />

    <div v-else class="players-grid">
      <BaseCard v-for="player in players" :key="player.id">
        <div class="player-card">
          <div class="player-avatar">{{ player.displayName[0] }}</div>
          <div class="player-info">
            <h3>{{ player.displayName }}</h3>
            <p v-if="player.notes" class="player-notes">{{ player.notes }}</p>
            
            <div class="player-meta">
                <span class="player-date">Added {{ formatDate(player.createdAt) }}</span>
                
                <div class="link-actions">
                    <span v-if="player.userId" class="status-badge linked" title="Linked to user">
                        <UserPlus :size="12"/> Linked
                    </span>
                    <button v-else @click="generateInvite(player)" class="link-btn" title="Generate Link">
                        <Link :size="12" /> Link
                    </button>
                </div>
            </div>
          </div>
        </div>
      </BaseCard>
    </div>

    <!-- Create Player Modal -->
    <Modal :open="showCreateModal" title="Create New Player" @close="showCreateModal = false">
      <form @submit.prevent="createPlayer">
        <div class="form-group">
          <BaseInput
            v-model="newPlayerName"
            label="Display Name"
            placeholder="e.g., John Smith"
          />
        </div>
        <div class="form-group">
          <label class="label">Notes (optional)</label>
          <textarea
            v-model="newPlayerNotes"
            class="textarea"
            placeholder="e.g., Left-handed, prefers kitchen play"
            rows="3"
          ></textarea>
        </div>
      </form>
      <template #footer>
        <BaseButton variant="secondary" @click="showCreateModal = false">Cancel</BaseButton>
        <BaseButton :loading="isCreating" @click="createPlayer">Create Player</BaseButton>
      </template>
    </Modal>

    <!-- Bulk Create Modal -->
    <BulkPlayerCreateModal 
      v-model:open="showBulkModal"
      @success="loadPlayers"
    />

    <!-- Invite Modal -->
    <Modal :open="showInviteModal" title="Link Player to User" @close="showInviteModal = false">
      <div class="invite-content">
        <p>Send this link to <strong>{{ invitingPlayerName }}</strong>. When they click it, this player profile will be linked to their account.</p>
        
        <div class="invite-link-box">
          <input type="text" readonly :value="inviteLink" class="link-input" />
          <BaseButton size="sm" @click="copyLink">
            <template v-if="copySuccess"><Check :size="16" /> Copied</template>
            <template v-else><Copy :size="16" /> Copy</template>
          </BaseButton>
        </div>
        <p v-if="copyError" class="copy-error">{{ copyError }}</p>
      </div>
      <template #footer>
        <BaseButton @click="showInviteModal = false">Close</BaseButton>
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

.search-bar {
  max-width: 400px;
  margin-bottom: var(--spacing-xl);
}

.players-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-md);
}

.player-card {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
}

.player-avatar {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-full);
  font-weight: 600;
  font-size: 1.25rem;
  flex-shrink: 0;
}

.player-info {
  flex: 1;
  min-width: 0;
}

.player-info h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: var(--spacing-xs);
}

.player-notes {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xs);
}

.player-date {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.error-message {
  padding: var(--spacing-lg);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error);
  text-align: center;
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

.name-count {
  color: var(--color-primary);
  font-weight: 600;
}

.textarea {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 1rem;
  font-family: inherit;
  resize: vertical;
}

.textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.bulk-textarea {
  font-family: var(--font-mono, monospace);
  line-height: 1.6;
}

.bulk-instructions {
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.bulk-result {
  margin-top: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
}

.result-success {
  color: var(--color-primary);
  font-weight: 500;
  margin-bottom: var(--spacing-sm);
}

.result-skipped {
  color: var(--color-warning, #f59e0b);
}

.result-label {
  font-weight: 500;
  display: block;
  margin-bottom: var(--spacing-xs);
}

.result-skipped ul {
  margin: 0;
  padding-left: var(--spacing-lg);
  font-size: 0.875rem;
}

.result-skipped li {
  margin-bottom: var(--spacing-xs);
}

.empty-actions {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  justify-content: center;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .header-actions {
    width: 100%;
  }

  .header-actions button {
    flex: 1;
  }

  .players-grid {
    grid-template-columns: 1fr;
  }
}
.player-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--spacing-sm);
}

.link-actions {
    display: flex;
    align-items: center;
}

.status-badge.linked {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--color-primary);
    background: rgba(16, 185, 129, 0.1);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-weight: 500;
}

.link-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
}

.link-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
}

.invite-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.invite-link-box {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
}

.link-input {
  flex: 1;
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: 0.875rem;
}

.copy-error {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.875rem;
  color: var(--color-error, #ef4444);
  background: rgba(239, 68, 68, 0.1);
  border-radius: var(--radius-sm);
}
</style>






