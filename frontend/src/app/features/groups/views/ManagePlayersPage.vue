<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { groupsApi } from '../services/groups.api'
import { playersApi } from '@/app/features/players/services/players.api'
import type { GroupDto, GroupPlayerDto, PlayerDto, MembershipType, SkillLevel, BulkAddPlayerItem } from '@/app/core/models/dto'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import EmptyState from '@/app/core/ui/components/EmptyState.vue'

const router = useRouter()
const route = useRoute()
const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const existingPlayers = ref<GroupPlayerDto[]>([])
const allPlayers = ref<PlayerDto[]>([])
const isLoading = ref(true)
const isSaving = ref(false)
const error = ref('')
const successMessage = ref('')

// Selection state: map of playerId -> membershipType
const selectedPlayers = ref<Map<string, MembershipType>>(new Map())
// Skill level for subs: map of playerId -> skillLevel
const subSkillLevels = ref<Map<string, SkillLevel>>(new Map())

onMounted(async () => {
  await loadData()
})

async function loadData() {
  isLoading.value = true
  error.value = ''
  try {
    const [groupRes, groupPlayersRes, allPlayersRes] = await Promise.all([
      groupsApi.get(groupId.value),
      groupsApi.getPlayers(groupId.value),
      playersApi.list()
    ])
    group.value = groupRes
    existingPlayers.value = groupPlayersRes.players
    allPlayers.value = allPlayersRes.players
  } catch (e: any) {
    error.value = e.message || 'Failed to load data'
  } finally {
    isLoading.value = false
  }
}

// Players not yet in the group
const availablePlayers = computed(() => {
  const existingPlayerIds = new Set(existingPlayers.value.map(p => p.playerId))
  return allPlayers.value.filter(p => !existingPlayerIds.has(p.id))
})

// Count of selected players
const selectedCount = computed(() => selectedPlayers.value.size)

// Count by type
const permanentCount = computed(() => {
  let count = 0
  selectedPlayers.value.forEach(type => {
    if (type === 'PERMANENT') count++
  })
  return count
})

const subCount = computed(() => {
  let count = 0
  selectedPlayers.value.forEach(type => {
    if (type === 'SUB') count++
  })
  return count
})

function isSelected(playerId: string): boolean {
  return selectedPlayers.value.has(playerId)
}

function getSelectedType(playerId: string): MembershipType | null {
  return selectedPlayers.value.get(playerId) || null
}

function togglePlayer(playerId: string, type: MembershipType) {
  const currentType = selectedPlayers.value.get(playerId)
  
  if (currentType === type) {
    // Clicking the same type deselects
    selectedPlayers.value.delete(playerId)
    subSkillLevels.value.delete(playerId)
  } else {
    // Select with this type
    selectedPlayers.value.set(playerId, type)
    // Default to INTERMEDIATE for subs
    if (type === 'SUB') {
      subSkillLevels.value.set(playerId, 'INTERMEDIATE')
    } else {
      subSkillLevels.value.delete(playerId)
    }
  }
  
  // Force reactivity
  selectedPlayers.value = new Map(selectedPlayers.value)
  subSkillLevels.value = new Map(subSkillLevels.value)
}

function setSkillLevel(playerId: string, level: SkillLevel) {
  subSkillLevels.value.set(playerId, level)
  subSkillLevels.value = new Map(subSkillLevels.value)
}

function getSkillLevel(playerId: string): SkillLevel {
  return subSkillLevels.value.get(playerId) || 'INTERMEDIATE'
}

function selectAllAs(type: MembershipType) {
  availablePlayers.value.forEach(p => {
    selectedPlayers.value.set(p.id, type)
  })
  selectedPlayers.value = new Map(selectedPlayers.value)
}

function clearSelection() {
  selectedPlayers.value = new Map()
  subSkillLevels.value = new Map()
}

async function saveSelection() {
  if (selectedCount.value === 0) return

  isSaving.value = true
  error.value = ''
  successMessage.value = ''

  try {
    const players: BulkAddPlayerItem[] = []
    selectedPlayers.value.forEach((type, playerId) => {
      players.push({ 
        playerId, 
        membershipType: type,
        skillLevel: type === 'SUB' ? subSkillLevels.value.get(playerId) : undefined
      })
    })

    const response = await groupsApi.bulkAddPlayers(groupId.value, { players })
    
    const addedCount = response.added.length
    const skippedCount = response.skipped.length
    
    if (addedCount > 0) {
      successMessage.value = `Successfully added ${addedCount} player${addedCount !== 1 ? 's' : ''}`
      if (skippedCount > 0) {
        successMessage.value += ` (${skippedCount} skipped - already in group)`
      }
    } else if (skippedCount > 0) {
      successMessage.value = `All ${skippedCount} players were already in the group`
    }

    // Clear selection and reload
    selectedPlayers.value = new Map()
    subSkillLevels.value = new Map()
    await loadData()

    // Auto-navigate back after success
    setTimeout(() => {
      router.push(`/groups/${groupId.value}`)
    }, 1500)
  } catch (e: any) {
    error.value = e.message || 'Failed to add players'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="manage-players container">
    <div class="page-header">
      <div>
        <router-link :to="`/groups/${groupId}`" class="back-link">← Back to Group</router-link>
        <h1>Add Players to Group</h1>
        <p v-if="group" class="subtitle">{{ group.name }}</p>
      </div>
    </div>

    <LoadingSpinner v-if="isLoading" text="Loading players..." />

    <template v-else>
      <div v-if="error" class="error-message">{{ error }}</div>
      <div v-if="successMessage" class="success-message">{{ successMessage }}</div>

      <EmptyState
        v-if="availablePlayers.length === 0"
        icon="✅"
        title="All players added"
        description="All your players are already in this group."
      >
        <template #action>
          <BaseButton @click="router.push('/players')">Create More Players</BaseButton>
        </template>
      </EmptyState>

      <template v-else>
        <!-- Selection Summary -->
        <BaseCard class="selection-summary">
          <div class="summary-content">
            <div class="summary-stats">
              <div class="stat">
                <span class="stat-value">{{ selectedCount }}</span>
                <span class="stat-label">Selected</span>
              </div>
              <div class="stat permanent">
                <span class="stat-value">{{ permanentCount }}</span>
                <span class="stat-label">Permanent</span>
              </div>
              <div class="stat sub">
                <span class="stat-value">{{ subCount }}</span>
                <span class="stat-label">Sub</span>
              </div>
            </div>
            <div class="summary-actions">
              <button class="text-btn" @click="selectAllAs('PERMANENT')">All as Permanent</button>
              <button class="text-btn" @click="selectAllAs('SUB')">All as Sub</button>
              <button class="text-btn danger" @click="clearSelection">Clear</button>
            </div>
          </div>
        </BaseCard>

        <!-- Player Selection Grid -->
        <div class="players-section">
          <h2>Available Players ({{ availablePlayers.length }})</h2>
          <p class="help-text">Click "P" for Permanent or "S" for Sub to select players.</p>
          
          <div class="players-grid">
            <div
              v-for="player in availablePlayers"
              :key="player.id"
              class="player-card"
              :class="{ selected: isSelected(player.id) }"
            >
              <div class="player-info">
                <div class="player-avatar">{{ player.displayName[0] }}</div>
                <div class="player-details">
                  <span class="player-name">{{ player.displayName }}</span>
                  <span v-if="player.notes" class="player-notes">{{ player.notes }}</span>
                </div>
              </div>
              <div class="type-buttons">
                <button
                  class="type-btn permanent"
                  :class="{ active: getSelectedType(player.id) === 'PERMANENT' }"
                  @click="togglePlayer(player.id, 'PERMANENT')"
                  title="Add as Permanent"
                >
                  P
                </button>
                <button
                  class="type-btn sub"
                  :class="{ active: getSelectedType(player.id) === 'SUB' }"
                  @click="togglePlayer(player.id, 'SUB')"
                  title="Add as Sub"
                >
                  S
                </button>
                <!-- Skill Level Dropdown for Subs -->
                <select
                  v-if="getSelectedType(player.id) === 'SUB'"
                  class="skill-select"
                  :value="getSkillLevel(player.id)"
                  @change="setSkillLevel(player.id, ($event.target as HTMLSelectElement).value as SkillLevel)"
                >
                  <option value="ADVANCED">A (+100)</option>
                  <option value="INTERMEDIATE">I (base)</option>
                  <option value="BEGINNER">B (-100)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="form-actions">
          <BaseButton variant="secondary" @click="router.push(`/groups/${groupId}`)">
            Cancel
          </BaseButton>
          <BaseButton
            :loading="isSaving"
            :disabled="selectedCount === 0"
            @click="saveSelection"
          >
            Add {{ selectedCount }} Player{{ selectedCount !== 1 ? 's' : '' }} to Group
          </BaseButton>
        </div>
      </template>
    </template>
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

.error-message {
  padding: var(--spacing-md);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error);
  margin-bottom: var(--spacing-lg);
}

.success-message {
  padding: var(--spacing-md);
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-primary);
  margin-bottom: var(--spacing-lg);
}

.selection-summary {
  margin-bottom: var(--spacing-xl);
}

.summary-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-md);
}

.summary-stats {
  display: flex;
  gap: var(--spacing-xl);
}

.stat {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  font-family: var(--font-mono);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat.permanent .stat-value {
  color: var(--color-primary);
}

.stat.sub .stat-value {
  color: #f59e0b;
}

.summary-actions {
  display: flex;
  gap: var(--spacing-md);
}

.text-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 0.875rem;
  cursor: pointer;
  padding: var(--spacing-xs) var(--spacing-sm);
}

.text-btn:hover {
  text-decoration: underline;
}

.text-btn.danger {
  color: var(--color-error);
}

.players-section h2 {
  font-size: 1.25rem;
  margin-bottom: var(--spacing-xs);
}

.help-text {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  margin-bottom: var(--spacing-lg);
}

.players-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
}

.player-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md);
  background: var(--color-bg-card);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.player-card.selected {
  border-color: var(--color-primary);
  background: rgba(16, 185, 129, 0.05);
}

.player-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex: 1;
  min-width: 0;
}

.player-avatar {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border-radius: var(--radius-full);
  font-weight: 600;
  flex-shrink: 0;
}

.player-card.selected .player-avatar {
  background: var(--color-primary);
  color: white;
}

.player-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.player-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-notes {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.type-buttons {
  display: flex;
  gap: var(--spacing-xs);
}

.type-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-muted);
  font-weight: 700;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.type-btn:hover {
  border-color: var(--color-text-muted);
}

.type-btn.permanent:hover,
.type-btn.permanent.active {
  border-color: var(--color-primary);
  background: rgba(16, 185, 129, 0.1);
  color: var(--color-primary);
}

.type-btn.sub:hover,
.type-btn.sub.active {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.skill-select {
  height: 36px;
  padding: 0 var(--spacing-sm);
  border: 2px solid #f59e0b;
  border-radius: var(--radius-md);
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  font-weight: 600;
  font-size: 0.75rem;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23f59e0b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  padding-right: 24px;
}

.skill-select:focus {
  outline: none;
  border-color: #d97706;
}

.skill-select option {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-md);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
}

@media (max-width: 768px) {
  .summary-content {
    flex-direction: column;
    align-items: stretch;
  }

  .summary-stats {
    justify-content: space-around;
  }

  .summary-actions {
    justify-content: center;
  }

  .players-grid {
    grid-template-columns: 1fr;
  }
}
</style>

