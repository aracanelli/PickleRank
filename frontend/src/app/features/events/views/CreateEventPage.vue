<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { eventsApi } from '../services/events.api'
import type { GroupPlayerDto } from '@/app/core/models/dto'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import BaseInput from '@/app/core/ui/components/BaseInput.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import { ArrowLeft } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const groupId = computed(() => route.params.groupId as string)

const group = ref<any>(null) // Using any for simplicity or import GroupDto
const players = ref<GroupPlayerDto[]>([])
const selectedPlayerIds = ref<Set<string>>(new Set())
const isLoading = ref(true)
const isCreating = ref(false)
const error = ref('')

// Form
const eventName = ref('')
const courts = ref(2)
const rounds = ref(4)

const requiredPlayers = computed(() => courts.value * 4)
const canCreate = computed(() => selectedPlayerIds.value.size === requiredPlayers.value)

// Split players by membership type
const permanentPlayers = computed(() => 
  players.value.filter(p => p.membershipType === 'PERMANENT')
)
const subPlayers = computed(() => 
  players.value.filter(p => p.membershipType === 'SUB')
)

// Counts
const selectedPermanentCount = computed(() => 
  permanentPlayers.value.filter(p => selectedPlayerIds.value.has(p.id)).length
)
const selectedSubCount = computed(() => 
  subPlayers.value.filter(p => selectedPlayerIds.value.has(p.id)).length
)

onMounted(async () => {
  await Promise.all([loadPlayers(), loadGroup()])
})

// Auto-select all permanent players and set default courts when players are loaded
watch(players, (newPlayers) => {
  if (newPlayers.length > 0) {
    const permanentIds = permanentPlayers.value.map(p => p.id)
    selectedPlayerIds.value = new Set(permanentIds)
    
    // Calculate default courts based on permanent players (rounded up)
    // Each court needs 4 players, so: Math.ceil(permanentPlayers / 4)
    const permanentCount = permanentPlayers.value.length
    if (permanentCount > 0) {
      const calculatedCourts = Math.ceil(permanentCount / 4)
      courts.value = Math.max(1, calculatedCourts) // Ensure at least 1 court
    }
  }
}, { immediate: true })

async function loadPlayers() {
  isLoading.value = true
  try {
    const response = await groupsApi.getPlayers(groupId.value)
    players.value = response.players
  } catch (e: any) {
    error.value = e.message || 'Failed to load players'
  } finally {
    isLoading.value = false
  }
}

async function loadGroup() {
  try {
    group.value = await groupsApi.get(groupId.value)
    if (group.value.settings?.defaultRounds) {
      rounds.value = group.value.settings.defaultRounds
    }
  } catch (e) {
    console.error('Failed to load group settings', e)
  }
}

function togglePlayer(playerId: string) {
  if (selectedPlayerIds.value.has(playerId)) {
    // Allow deselecting any player
    selectedPlayerIds.value.delete(playerId)
  } else {
    // Only allow selecting if we haven't reached the limit
    if (selectedPlayerIds.value.size < requiredPlayers.value) {
      selectedPlayerIds.value.add(playerId)
    }
  }
  // Force reactivity
  selectedPlayerIds.value = new Set(selectedPlayerIds.value)
}

function selectAllPermanent() {
  const permanentIds = permanentPlayers.value.map(p => p.id)
  const currentSelected = Array.from(selectedPlayerIds.value)
  
  // Start with all permanent players
  const newSelection = new Set(permanentIds)
  
  // Add any currently selected sub players (up to the limit)
  let added = permanentIds.length
  for (const subId of subPlayers.value.map(p => p.id)) {
    if (currentSelected.includes(subId) && added < requiredPlayers.value) {
      newSelection.add(subId)
      added++
    }
  }
  
  selectedPlayerIds.value = newSelection
}

function clearSelection() {
  selectedPlayerIds.value = new Set()
}

async function createEvent() {
  if (!canCreate.value) return

  isCreating.value = true
  error.value = ''

  try {
    const event = await eventsApi.create(groupId.value, {
      name: eventName.value || undefined,
      courts: courts.value,
      rounds: rounds.value,
      participantIds: Array.from(selectedPlayerIds.value)
    })
    router.push(`/events/${event.id}`)
  } catch (e: any) {
    error.value = e.message || 'Failed to create event'
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="create-event container">
    <div class="page-header">
      <div>
        <router-link :to="`/groups/${groupId}`" class="back-link"><ArrowLeft :size="16" /> Back to Group</router-link>
        <h1>Create New Event</h1>
      </div>
    </div>

    <LoadingSpinner v-if="isLoading" text="Loading players..." />

    <template v-else>
      <div v-if="error" class="error-message">{{ error }}</div>

      <div class="form-layout">
        <!-- Left: Configuration -->
        <div class="config-section">
          <BaseCard title="Event Configuration">
            <div class="form-group">
              <BaseInput
                v-model="eventName"
                label="Event Name (optional)"
                placeholder="e.g., Friday Night Session"
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="label">Courts</label>
                <input
                  type="number"
                  v-model.number="courts"
                  class="input"
                  min="1"
                  max="10"
                />
              </div>
              <div class="form-group">
                <label class="label">Rounds</label>
                <input
                  type="number"
                  v-model.number="rounds"
                  class="input"
                  min="1"
                  max="20"
                />
              </div>
            </div>

            <div class="requirement-badge">
              Requires exactly <strong>{{ requiredPlayers }}</strong> players
              ({{ courts }} courts × 4 players)
            </div>
          </BaseCard>
        </div>

        <!-- Right: Player Selection -->
        <div class="players-section">
          <BaseCard>
            <template #header>
              <div class="players-header">
                <h3>Select Participants</h3>
                <span class="selection-count" :class="{ complete: canCreate }">
                  {{ selectedPlayerIds.size }} / {{ requiredPlayers }}
                </span>
              </div>
              <div class="selection-actions">
                <button class="text-btn" @click="selectAllPermanent">Select All Permanent</button>
                <button class="text-btn" @click="clearSelection">Clear</button>
              </div>
            </template>

            <div v-if="players.length === 0" class="empty-players">
              <p>No players in this group yet.</p>
              <router-link :to="`/groups/${groupId}`">Add players first</router-link>
            </div>

            <div v-else class="players-container">
              <!-- Permanent Players Section -->
              <div class="player-group">
                <div class="group-header">
                  <h4 class="group-title permanent">
                    <span class="group-icon">⭐</span>
                    Permanent Players
                    <span class="group-count">
                      {{ selectedPermanentCount }} / {{ permanentPlayers.length }} selected
                    </span>
                  </h4>
                </div>
                <div v-if="permanentPlayers.length === 0" class="empty-group">
                  <p>No permanent players in this group.</p>
                </div>
                <div v-else class="players-grid">
                  <button
                    v-for="player in permanentPlayers"
                    :key="player.id"
                    class="player-chip permanent"
                    :class="{ selected: selectedPlayerIds.has(player.id) }"
                    @click="togglePlayer(player.id)"
                  >
                    <span class="chip-avatar">{{ player.displayName[0] }}</span>
                    <span class="chip-name">{{ player.displayName }}</span>
                    <span class="chip-rating">{{ Math.round(player.rating) }}</span>
                  </button>
                </div>
              </div>

              <!-- Sub Players Section -->
              <div class="player-group">
                <div class="group-header">
                  <h4 class="group-title sub">
                    <span class="group-icon">🔄</span>
                    Sub Players
                    <span class="group-count">
                      {{ selectedSubCount }} / {{ subPlayers.length }} selected
                    </span>
                  </h4>
                </div>
                <div v-if="subPlayers.length === 0" class="empty-group">
                  <p>No sub players in this group.</p>
                </div>
                <div v-else class="players-grid">
                  <button
                    v-for="player in subPlayers"
                    :key="player.id"
                    class="player-chip sub"
                    :class="{ 
                      selected: selectedPlayerIds.has(player.id),
                      disabled: !selectedPlayerIds.has(player.id) && selectedPlayerIds.size >= requiredPlayers
                    }"
                    @click="togglePlayer(player.id)"
                    :disabled="!selectedPlayerIds.has(player.id) && selectedPlayerIds.size >= requiredPlayers"
                  >
                    <span class="chip-avatar">{{ player.displayName[0] }}</span>
                    <span class="chip-name">{{ player.displayName }}</span>
                    <span class="chip-rating">{{ Math.round(player.rating) }}</span>
                  </button>
                </div>
              </div>
            </div>
          </BaseCard>
        </div>
      </div>

      <div class="form-actions">
        <BaseButton variant="secondary" @click="router.back()">Cancel</BaseButton>
        <BaseButton
          :loading="isCreating"
          :disabled="!canCreate"
          @click="createEvent"
        >
          Create Event & Generate Schedule
        </BaseButton>
      </div>
    </template>
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
  font-size: 2rem;
}

.error-message {
  padding: var(--spacing-md);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error);
  margin-bottom: var(--spacing-lg);
}

.form-layout {
  display: grid;
  grid-template-columns: 350px 1fr;
  gap: var(--spacing-xl);
  margin-bottom: var(--spacing-xl);
}

.form-group {
  margin-bottom: var(--spacing-md);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
}

.label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xs);
}

.input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 1rem;
}

.requirement-badge {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  text-align: center;
}

.players-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.selection-count {
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-full);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.selection-count.complete {
  background: rgba(16, 185, 129, 0.1);
  color: var(--color-primary);
}

.selection-actions {
  display: flex;
  gap: var(--spacing-md);
}

.text-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 0.875rem;
  cursor: pointer;
}

.text-btn:hover {
  text-decoration: underline;
}

.empty-players {
  text-align: center;
  padding: var(--spacing-xl);
  color: var(--color-text-secondary);
}

.players-container {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
}

.player-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.group-header {
  padding-bottom: var(--spacing-sm);
  border-bottom: 2px solid var(--color-border);
}

.group-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.group-title.permanent {
  color: var(--color-primary);
}

.group-title.sub {
  color: #f59e0b;
}

.group-icon {
  font-size: 1.25rem;
}

.group-count {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-muted);
}

.empty-group {
  text-align: center;
  padding: var(--spacing-lg);
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.players-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.player-chip {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md) var(--spacing-xs) var(--spacing-xs);
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.player-chip:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.player-chip.permanent.selected {
  background: rgba(16, 185, 129, 0.15);
  border-color: var(--color-primary);
}

.player-chip.sub.selected {
  background: rgba(245, 158, 11, 0.15);
  border-color: #f59e0b;
}

.player-chip:disabled,
.player-chip.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chip-avatar {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  font-weight: 600;
  font-size: 0.75rem;
}

.player-chip.permanent.selected .chip-avatar {
  background: var(--color-primary);
  color: white;
}

.player-chip.sub.selected .chip-avatar {
  background: #f59e0b;
  color: white;
}

.chip-name {
  font-weight: 500;
  font-size: 0.875rem;
}

.chip-rating {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-md);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
}

@media (max-width: 1024px) {
  .form-layout {
    grid-template-columns: 1fr;
  }
}
</style>



