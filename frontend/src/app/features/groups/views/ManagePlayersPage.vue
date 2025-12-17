<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { groupsApi } from '../services/groups.api'
import { playersApi } from '@/app/features/players/services/players.api'
import type { GroupDto, GroupPlayerDto, PlayerDto, MembershipType, SkillLevel, BulkAddPlayerItem, GroupRole } from '@/app/core/models/dto'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import Modal from '@/app/core/ui/components/Modal.vue'
import BulkPlayerCreateModal from '@/app/features/players/components/BulkPlayerCreateModal.vue'
import { Shield, UserPlus, Link, Copy, Check, FileText } from 'lucide-vue-next'

const route = useRoute()
const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const existingPlayers = ref<GroupPlayerDto[]>([])
const allPlayers = ref<PlayerDto[]>([])
const isLoading = ref(true)
const isSaving = ref(false)
const error = ref('')
const successMessage = ref('')

// Selection state for adding new players: map of playerId -> membershipType
const selectedPlayers = ref<Map<string, MembershipType>>(new Map())
// Skill level for subs: map of playerId -> skillLevel
const subSkillLevels = ref<Map<string, SkillLevel>>(new Map())

// Invite state
const showInviteModal = ref(false)
const inviteLink = ref('')
const invitingPlayerName = ref('')
const copySuccess = ref(false)

// Track updates in progress
const updatingPlayerId = ref<string | null>(null)

// Bulk Create
const showBulkModal = ref(false)

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

// Separate permanent and sub players
const permanentExisting = computed(() => existingPlayers.value.filter(p => p.membershipType === 'PERMANENT'))
const subExisting = computed(() => existingPlayers.value.filter(p => p.membershipType === 'SUB'))

// Count of selected players
const selectedCount = computed(() => selectedPlayers.value.size)

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
    
    if (addedCount > 0) {
      successMessage.value = `Added ${addedCount} player${addedCount !== 1 ? 's' : ''}`
    }

    // Clear selection and reload
    selectedPlayers.value = new Map()
    subSkillLevels.value = new Map()
    await loadData()
  } catch (e: any) {
    error.value = e.message || 'Failed to add players'
  } finally {
    isSaving.value = false
  }
}

async function toggleMembershipType(player: GroupPlayerDto) {
  const newType: MembershipType = player.membershipType === 'PERMANENT' ? 'SUB' : 'PERMANENT'
  
  updatingPlayerId.value = player.id
  try {
    await groupsApi.updateGroupPlayer(groupId.value, player.id, { membershipType: newType })
    await loadData()
    successMessage.value = `Changed ${player.displayName} to ${newType === 'PERMANENT' ? 'Permanent' : 'Sub'}`
  } catch (e: any) {
    error.value = e.message || 'Failed to update player'
  } finally {
    updatingPlayerId.value = null
  }
}

async function updateSkillLevel(player: GroupPlayerDto, skillLevel: SkillLevel) {
  updatingPlayerId.value = player.id
  try {
    await groupsApi.updateGroupPlayer(groupId.value, player.id, { skillLevel })
    await loadData()
  } catch (e: any) {
    error.value = e.message || 'Failed to update skill level'
  } finally {
    updatingPlayerId.value = null
  }
}

async function removePlayer(player: GroupPlayerDto) {
  if (!confirm(`Remove ${player.displayName} from the group?`)) return
  
  updatingPlayerId.value = player.id
  try {
    await groupsApi.removePlayer(groupId.value, player.id)
    await loadData()
    successMessage.value = `Removed ${player.displayName}`
  } catch (e: any) {
    error.value = e.message || 'Failed to remove player'
  } finally {
    updatingPlayerId.value = null
  }
}

async function updateRole(player: GroupPlayerDto) {
  const newRole: GroupRole = player.role === 'ORGANIZER' ? 'PLAYER' : 'ORGANIZER'
  
  updatingPlayerId.value = player.id
  try {
    await groupsApi.updateGroupPlayer(groupId.value, player.id, { role: newRole })
    await loadData()
    successMessage.value = `Changed ${player.displayName} to ${newRole === 'ORGANIZER' ? 'Organizer' : 'Player'}`
  } catch (e: any) {
    error.value = e.message || 'Failed to update role'
  } finally {
    updatingPlayerId.value = null
  }
}

async function invitePlayer(player: GroupPlayerDto) {
  try {
     const token = await playersApi.generateInvite(player.playerId)
     const baseUrl = window.location.origin
     inviteLink.value = `${baseUrl}/link-player?token=${token}`
     invitingPlayerName.value = player.displayName
     showInviteModal.value = true
     copySuccess.value = false
  } catch (e: any) {
     error.value = e.message || 'Failed to generate invite'
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 2000)
  } catch (e) {
    console.error('Failed to copy', e)
  }
}

async function handleBulkSuccess() {
  await loadData()
  successMessage.value = 'Players created successfully! You can now add them to the group.'
}
</script>

<template>
  <div class="manage-players container">
    <div class="page-header">
      <div>
        <router-link :to="`/groups/${groupId}`" class="back-link">← Back to Group</router-link>
        <h1>Manage Players</h1>
        <p v-if="group" class="subtitle">{{ group.name }}</p>
      </div>
      <BaseButton variant="secondary" @click="showBulkModal = true">
          <FileText :size="16" /> Bulk Add Players
      </BaseButton>
    </div>

    <LoadingSpinner v-if="isLoading" text="Loading players..." />

    <template v-else>
      <div v-if="error" class="error-message">{{ error }}</div>
      <div v-if="successMessage" class="success-message">{{ successMessage }}</div>

      <!-- Existing Players Section -->
      <section class="section" v-if="existingPlayers.length > 0">
        <h2>Group Players ({{ existingPlayers.length }})</h2>
        <p class="help-text">Manage membership type, skill level for subs, or remove players.</p>
        
        <!-- Permanent Players -->
        <div v-if="permanentExisting.length > 0" class="players-subsection">
          <h3 class="subsection-title">
            <span class="type-indicator permanent"></span>
            Permanent ({{ permanentExisting.length }})
          </h3>
          <div class="players-grid">
            <div 
              v-for="player in permanentExisting" 
              :key="player.id" 
              class="player-card existing"
            >
              <div class="player-info">
                <div class="player-avatar permanent">{{ player.displayName[0] }}</div>
                <div class="player-details">
                  <span class="player-name">{{ player.displayName }}</span>
                  <span class="player-stats">
                    {{ player.rating.toFixed(1) }} • {{ player.gamesPlayed }} games
                  </span>
                </div>
              </div>
              <div class="player-actions">
                <button 
                    v-if="!player.userId"
                    class="action-btn invite"
                    @click="invitePlayer(player)"
                    title="Invite to Link"
                >
                    <Link :size="14" />
                </button>
                <div v-else class="linked-indicator" title="Linked to User"><UserPlus :size="14" /></div>

                <button 
                    class="action-btn role"
                    :class="{ organizer: player.role === 'ORGANIZER' }"
                    @click="updateRole(player)"
                    :title="player.role === 'ORGANIZER' ? 'Demote to Player' : 'Promote to Organizer'"
                >
                  <Shield :size="14" />
                </button>

                <button 
                  class="action-btn switch"
                  :disabled="updatingPlayerId === player.id"
                  @click="toggleMembershipType(player)"
                  title="Change to Sub"
                >
                  → Sub
                </button>
                <button 
                  class="action-btn remove"
                  :disabled="updatingPlayerId === player.id"
                  @click="removePlayer(player)"
                  title="Remove from group"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Sub Players -->
        <div v-if="subExisting.length > 0" class="players-subsection">
          <h3 class="subsection-title">
            <span class="type-indicator sub"></span>
            Subs ({{ subExisting.length }})
          </h3>
          <div class="players-grid">
            <div 
              v-for="player in subExisting" 
              :key="player.id" 
              class="player-card existing sub"
            >
              <div class="player-info">
                <div class="player-avatar sub">{{ player.displayName[0] }}</div>
                <div class="player-details">
                  <span class="player-name">{{ player.displayName }}</span>
                  <span class="player-stats">
                    {{ player.rating.toFixed(1) }} • {{ player.gamesPlayed }} games
                  </span>
                </div>
              </div>
              <div class="player-actions">
                <button 
                    v-if="!player.userId"
                    class="action-btn invite"
                    @click="invitePlayer(player)"
                    title="Invite to Link"
                >
                    <Link :size="14" />
                </button>
                <div v-else class="linked-indicator" title="Linked to User"><UserPlus :size="14" /></div>

                <button 
                    class="action-btn role"
                    :class="{ organizer: player.role === 'ORGANIZER' }"
                    @click="updateRole(player)"
                    :title="player.role === 'ORGANIZER' ? 'Demote to Player' : 'Promote to Organizer'"
                >
                  <Shield :size="14" />
                </button>

                <select
                  class="skill-select"
                  :disabled="updatingPlayerId === player.id"
                  :value="player.skillLevel || 'INTERMEDIATE'"
                  @change="updateSkillLevel(player, ($event.target as HTMLSelectElement).value as SkillLevel)"
                >
                  <option value="ADVANCED">A (+100)</option>
                  <option value="INTERMEDIATE">I (base)</option>
                  <option value="BEGINNER">B (-100)</option>
                </select>
                <button 
                  class="action-btn switch"
                  :disabled="updatingPlayerId === player.id"
                  @click="toggleMembershipType(player)"
                  title="Change to Permanent"
                >
                  → Perm
                </button>
                <button 
                  class="action-btn remove"
                  :disabled="updatingPlayerId === player.id"
                  @click="removePlayer(player)"
                  title="Remove from group"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr class="divider" v-if="existingPlayers.length > 0 && availablePlayers.length > 0" />

      <!-- Add New Players Section -->
      <section class="section" v-if="availablePlayers.length > 0">
        <h2>Add Players ({{ availablePlayers.length }} available)</h2>
        <p class="help-text">Click "P" for Permanent or "S" for Sub to select players to add.</p>
        
        <div class="players-grid">
          <div
            v-for="player in availablePlayers"
            :key="player.id"
            class="player-card"
            :class="{ selected: isSelected(player.id) }"
          >
            <div class="player-info">
              <div class="player-avatar" :class="{ selected: isSelected(player.id) }">
                {{ player.displayName[0] }}
              </div>
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

        <!-- Add Button -->
        <div class="form-actions" v-if="selectedCount > 0">
          <BaseButton
            :loading="isSaving"
            @click="saveSelection"
          >
            Add {{ selectedCount }} Player{{ selectedCount !== 1 ? 's' : '' }}
          </BaseButton>
        </div>
      </section>

      <!-- No players available to add -->
      <section v-if="availablePlayers.length === 0 && existingPlayers.length > 0" class="section">
        <BaseCard class="all-added-card">
          <div class="all-added-content">
            <span class="all-added-icon">✅</span>
            <p>Don't see who you're looking for?</p>
            <BaseButton variant="secondary" size="sm" @click="showBulkModal = true">
              Bulk Add New Players
            </BaseButton>
          </div>
        </BaseCard>
      </section>
    </template>

    <!-- Invite Modal -->
    <Modal :open="showInviteModal" title="Invite Player to Link" @close="showInviteModal = false">
      <div class="invite-content">
        <p>Send this link to <strong>{{ invitingPlayerName }}</strong> to link their account to this player profile.</p>
        
        <div class="invite-link-box">
          <input type="text" readonly :value="inviteLink" class="link-input" />
          <BaseButton size="sm" @click="copyLink">
            <template v-if="copySuccess"><Check :size="16" /> Copied</template>
            <template v-else><Copy :size="16" /> Copy</template>
          </BaseButton>
        </div>
        
        <p class="invite-note">This link allows the user to claim this player profile and see it in their dashboard.</p>
      </div>
      <template #footer>
        <BaseButton @click="showInviteModal = false">Close</BaseButton>
      </template>
    </Modal>

    <BulkPlayerCreateModal 
      v-model:open="showBulkModal"
      @success="handleBulkSuccess"
    />
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: var(--spacing-xl);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
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

.section {
  margin-bottom: var(--spacing-xl);
}

.section h2 {
  font-size: 1.25rem;
  margin-bottom: var(--spacing-xs);
}

.help-text {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  margin-bottom: var(--spacing-lg);
}

.players-subsection {
  margin-bottom: var(--spacing-lg);
}

.subsection-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.type-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.type-indicator.permanent {
  background: var(--color-primary);
}

.type-indicator.sub {
  background: #f59e0b;
}

.divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: var(--spacing-xl) 0;
}

.players-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-md);
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
  gap: var(--spacing-sm);
}

.player-card.selected {
  border-color: var(--color-primary);
  background: rgba(16, 185, 129, 0.05);
}

.player-card.existing {
  border-color: var(--color-border);
}

.player-card.existing.sub {
  border-color: rgba(245, 158, 11, 0.3);
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

.player-avatar.selected,
.player-avatar.permanent {
  background: var(--color-primary);
  color: white;
}

.player-avatar.sub {
  background: #f59e0b;
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

.player-stats {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.player-notes {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-actions {
  display: flex;
  gap: var(--spacing-xs);
  align-items: center;
  flex-shrink: 0;
}

.action-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover:not(:disabled) {
  border-color: var(--color-text-muted);
}

.action-btn.switch:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.action-btn.remove:hover:not(:disabled) {
  border-color: var(--color-error);
  color: var(--color-error);
  background: rgba(239, 68, 68, 0.1);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.type-buttons {
  display: flex;
  gap: var(--spacing-xs);
  flex-shrink: 0;
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
  justify-content: center;
  padding-top: var(--spacing-lg);
}

.all-added-card {
  text-align: center;
}

.all-added-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
}

.all-added-icon {
  font-size: 2rem;
}

.all-added-content p {
  color: var(--color-text-secondary);
}

@media (max-width: 768px) {
  .players-grid {
    grid-template-columns: 1fr;
  }

  .player-card {
    flex-wrap: wrap;
  }

  .player-actions {
    width: 100%;
    justify-content: flex-end;
    margin-top: var(--spacing-sm);
    padding-top: var(--spacing-sm);
    border-top: 1px solid var(--color-border);
  }
}
.linked-indicator {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  background: rgba(16, 185, 129, 0.1);
  border-radius: var(--radius-sm);
}

.action-btn.role.organizer {
  color: #7c3aed;
  border-color: #7c3aed;
  background: rgba(124, 58, 237, 0.1);
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

.invite-note {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}
</style>





