<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { groupsApi } from '../services/groups.api'
import type { GroupDto } from '@/app/core/models/dto'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import { ArrowLeft } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const isLoading = ref(true)
const isSaving = ref(false)
const isRenaming = ref(false)
const error = ref('')
const success = ref('')
const groupName = ref('')

// Form fields
const ratingSystem = ref<'SERIOUS_ELO' | 'CATCH_UP' | 'RACS_ELO'>('SERIOUS_ELO')
const initialRating = ref(1000)
const kFactor = ref(32)
const eloConst = ref<number | undefined>(undefined)
const eloDiff = ref(0.05)
const noRepeatTeammateInEvent = ref(true)
const noRepeatTeammateFromPreviousEvent = ref(true)
const noRepeatOpponentInEvent = ref(true)
const autoRelaxEloDiff = ref(true)
const autoRelaxStep = ref(0.01)
const autoRelaxMaxEloDiff = ref(0.25)
const defaultRounds = ref(1)

onMounted(async () => {
  await loadGroup()
})

async function loadGroup() {
  isLoading.value = true
  try {
    group.value = await groupsApi.get(groupId.value)
    groupName.value = group.value.name
    // Populate form
    const s = group.value.settings
    ratingSystem.value = s.ratingSystem
    initialRating.value = s.initialRating
    kFactor.value = s.kFactor
    // Set eloConst: use saved value, or default based on rating system
    if (s.eloConst != null) {
      eloConst.value = s.eloConst
    } else {
      eloConst.value = s.ratingSystem === 'RACS_ELO' ? 0.3 : 400
    }
    eloDiff.value = s.eloDiff
    noRepeatTeammateInEvent.value = s.noRepeatTeammateInEvent
    noRepeatTeammateFromPreviousEvent.value = s.noRepeatTeammateFromPreviousEvent
    noRepeatOpponentInEvent.value = s.noRepeatOpponentInEvent
    autoRelaxEloDiff.value = s.autoRelaxEloDiff
    autoRelaxStep.value = s.autoRelaxStep
    autoRelaxMaxEloDiff.value = s.autoRelaxMaxEloDiff
    defaultRounds.value = s.defaultRounds || 1
  } catch (e: any) {
    error.value = e.message || 'Failed to load group'
  } finally {
    isLoading.value = false
    // Allow watcher to run only after initial load is done
    nextTick(() => {
      isInitialLoad.value = false
    })
  }
}

async function renameGroup() {
  if (!groupName.value.trim()) return
  isRenaming.value = true
  error.value = ''
  try {
    const updated = await groupsApi.rename(groupId.value, groupName.value.trim())
    group.value = updated
    success.value = 'Group renamed successfully!'
    setTimeout(() => success.value = '', 3000)
  } catch (e: any) {
    error.value = e.message || 'Failed to rename group'
  } finally {
    isRenaming.value = false
  }
}

// Auto-populate defaults when rating system changes



const isInitialLoad = ref(true)

watch(ratingSystem, async (newValue) => {
  if (isInitialLoad.value) return
  
  if (newValue === 'RACS_ELO') {
    // Rac's ELO uses k_const = 100 and elo_const = 0.3
    kFactor.value = 100
    eloConst.value = 0.3
  } else if (newValue === 'SERIOUS_ELO') {
    kFactor.value = 32
    eloConst.value = 400
  } else if (newValue === 'CATCH_UP') {
    kFactor.value = 32
    eloConst.value = 400
  }
})

async function saveSettings() {
  isSaving.value = true
  error.value = ''
  success.value = ''

  try {
    await groupsApi.updateSettings(groupId.value, {
      ratingSystem: ratingSystem.value,
      initialRating: initialRating.value,
      kFactor: kFactor.value,
      eloConst: eloConst.value,
      eloDiff: eloDiff.value,
      noRepeatTeammateInEvent: noRepeatTeammateInEvent.value,
      noRepeatTeammateFromPreviousEvent: noRepeatTeammateFromPreviousEvent.value,
      noRepeatOpponentInEvent: noRepeatOpponentInEvent.value,
      autoRelaxEloDiff: autoRelaxEloDiff.value,
      autoRelaxStep: autoRelaxStep.value,
      autoRelaxMaxEloDiff: autoRelaxMaxEloDiff.value,
      defaultRounds: defaultRounds.value
    })
    success.value = 'Settings saved successfully!'
    setTimeout(() => success.value = '', 3000)
  } catch (e: any) {
    error.value = e.message || 'Failed to save settings'
  } finally {
    isSaving.value = false
  }
}

const isRecalculating = ref(false)
const recalculateResult = ref<{eventsRecalculated: number, playersUpdated: number} | null>(null)

async function recalculateRatings() {
  if (!confirm('This will reset all player ratings and recalculate from all completed events. Continue?')) {
    return
  }
  
  isRecalculating.value = true
  error.value = ''
  recalculateResult.value = null

  try {
    const result = await groupsApi.recalculateRatings(groupId.value)
    recalculateResult.value = result
    success.value = `Recalculated! ${result.eventsRecalculated} events processed, ${result.playersUpdated} players updated.`
    setTimeout(() => {
      success.value = ''
      recalculateResult.value = null
    }, 5000)
  } catch (e: any) {
    error.value = e.message || 'Failed to recalculate ratings'
  } finally {
    isRecalculating.value = false
  }
}

const isArchiving = ref(false)

async function archiveGroup() {
  if (!confirm('Are you sure you want to archive this group? It will be hidden from your dashboard.')) {
    return
  }

  isArchiving.value = true
  error.value = ''
  try {
    await groupsApi.archive(groupId.value)
    router.push('/groups')
  } catch (e: any) {
    error.value = e.message || 'Failed to archive group'
    isArchiving.value = false
  }
}

const isDuplicating = ref(false)

async function duplicateGroup() {
  if (!confirm('Create a copy of this group with all players but no history?')) {
    return
  }

  isDuplicating.value = true
  error.value = ''
  try {
    const newGroup = await groupsApi.duplicate(groupId.value)
    success.value = `Created "${newGroup.name}"! Redirecting...`
    setTimeout(() => {
      router.push(`/groups/${newGroup.id}`)
    }, 1500)
  } catch (e: any) {
    error.value = e.message || 'Failed to duplicate group'
    isDuplicating.value = false
  }
}
</script>

<template>
  <div class="settings-page container">
    <LoadingSpinner v-if="isLoading" text="Loading settings..." />

    <template v-else-if="group">
      <div class="page-header">
        <div>
          <router-link :to="`/groups/${groupId}`" class="back-link"><ArrowLeft :size="16" /> Back to Group</router-link>
          <h1>Group Settings</h1>
        </div>
      </div>

      <div v-if="error" class="message error">{{ error }}</div>
      <div v-if="success" class="message success">{{ success }}</div>

      <div class="warning-banner">
        ⚠️ Changes affect future events only. Historical events remain unchanged.
      </div>

      <form @submit.prevent="saveSettings">
        <!-- Group Name -->
        <BaseCard title="Group Info">
          <div class="form-group">
            <label class="label">Group Name</label>
            <div class="name-input-row">
              <input 
                type="text" 
                v-model="groupName" 
                class="input" 
                placeholder="Enter group name"
                maxlength="100"
              />
              <BaseButton 
                type="button" 
                variant="secondary" 
                size="sm"
                :disabled="isRenaming || groupName === group.name"
                @click="renameGroup"
              >
                {{ isRenaming ? 'Saving...' : 'Rename' }}
              </BaseButton>
            </div>
          </div>
        </BaseCard>

        <!-- Rating System -->
        <BaseCard title="Rating System">
          <div class="form-group">
            <label class="label">System Type</label>
            <div class="radio-group">
              <label class="radio-option">
                <input type="radio" v-model="ratingSystem" value="SERIOUS_ELO" />
                <div class="radio-content">
                  <span class="radio-title">🎯 Serious ELO</span>
                  <span class="radio-desc">Standard competitive rating. Fair and consistent.</span>
                </div>
              </label>
              <label class="radio-option">
                <input type="radio" v-model="ratingSystem" value="CATCH_UP" />
                <div class="radio-content">
                  <span class="radio-title">🎉 Catch-Up Mode</span>
                  <span class="radio-desc">Fun mode that helps lower-rated players catch up faster.</span>
                </div>
              </label>
              <label class="radio-option">
                <input type="radio" v-model="ratingSystem" value="RACS_ELO" />
                <div class="radio-content">
                  <span class="radio-title">🚀 Rac's ELO</span>
                  <span class="radio-desc">Volatile ratings with score-based K-factor. Blowouts matter more!</span>
                </div>
              </label>
            </div>
          </div>

          <div class="form-row form-row-3">
            <div class="form-group">
              <label class="label">Initial Rating</label>
              <input type="number" v-model.number="initialRating" class="input" min="0" max="3000" />
              <span class="hint">Starting rating</span>
            </div>
            <div class="form-group">
              <label class="label">K-Factor</label>
              <input type="number" v-model.number="kFactor" class="input" min="1" max="200" />
              <span class="hint">Volatility</span>
            </div>
            <div class="form-group">
              <label class="label">ELO Constant</label>
              <input type="number" v-model.number="eloConst" class="input" :min="ratingSystem === 'RACS_ELO' ? 0.1 : 100" :max="ratingSystem === 'RACS_ELO' ? 1 : 800" :step="ratingSystem === 'RACS_ELO' ? 0.1 : 50" />
              <span class="hint">Sensitivity</span>
            </div>
          </div>
        </BaseCard>



        <!-- Default Event Settings -->
        <BaseCard title="Default Event Settings">
          <div class="form-group">
            <label class="label">Default Rounds</label>
            <input type="number" v-model.number="defaultRounds" class="input" min="1" max="10" />
            <span class="hint">Number of rounds pre-filled when creating an event</span>
          </div>
        </BaseCard>

        <!-- Matchmaking Constraints -->
        <BaseCard title="Matchmaking Constraints">
          <div class="toggle-group">
            <label class="toggle">
              <input type="checkbox" v-model="noRepeatTeammateInEvent" />
              <span class="toggle-label">No repeat teammate in same event</span>
            </label>
            <label class="toggle">
              <input type="checkbox" v-model="noRepeatTeammateFromPreviousEvent" />
              <span class="toggle-label">No repeat teammate from previous event</span>
            </label>
            <label class="toggle">
              <input type="checkbox" v-model="noRepeatOpponentInEvent" />
              <span class="toggle-label">No repeat opponent in same event</span>
            </label>
          </div>
        </BaseCard>

        <!-- Rating Balance -->
        <BaseCard title="Rating Balance">
          <div class="form-group">
            <label class="label">Max ELO Difference ({{ (eloDiff * 100).toFixed(0) }}%)</label>
            <input type="range" v-model.number="eloDiff" class="slider" min="0.01" max="0.5" step="0.01" />
            <span class="hint">Maximum allowed rating imbalance between teams</span>
          </div>

          <div class="toggle-group">
            <label class="toggle">
              <input type="checkbox" v-model="autoRelaxEloDiff" />
              <span class="toggle-label">Auto-relax if no valid schedule found</span>
            </label>
          </div>

          <div v-if="autoRelaxEloDiff" class="form-row">
            <div class="form-group">
              <label class="label">Relax Step</label>
              <input type="number" v-model.number="autoRelaxStep" class="input" min="0.005" max="0.1" step="0.005" />
            </div>
            <div class="form-group">
              <label class="label">Max ELO Diff</label>
              <input type="number" v-model.number="autoRelaxMaxEloDiff" class="input" min="0.1" max="0.5" step="0.05" />
            </div>
          </div>
        </BaseCard>

        <div class="form-actions">
          <BaseButton variant="secondary" type="button" @click="router.back()">Cancel</BaseButton>
          <BaseButton type="submit" :loading="isSaving">Save Settings</BaseButton>
        </div>
      </form>

      <!-- Danger Zone - Outside form to ensure button clicks work -->
      <BaseCard title="Danger Zone" class="danger-zone">
        <div class="danger-item">
          <div class="danger-info">
            <strong>Recalculate All Ratings</strong>
            <span class="hint">Reset all player ratings and recalculate from completed events.</span>
          </div>
          <BaseButton 
            variant="secondary" 
            @click="recalculateRatings" 
            :loading="isRecalculating"
          >
            🔄 Recalculate
          </BaseButton>
        </div>

        <div class="danger-item">
          <div class="danger-info">
            <strong>Duplicate Group</strong>
            <span class="hint">Create a copy with same players and settings, but no history.</span>
          </div>
          <BaseButton 
            variant="secondary" 
            @click="duplicateGroup" 
            :loading="isDuplicating"
          >
            📋 Duplicate
          </BaseButton>
        </div>

        <div class="danger-item">
          <div class="danger-info">
            <strong>Archive Group</strong>
            <span class="hint">Hide this group from your dashboard. Only you can archive it.</span>
          </div>
          <BaseButton 
            variant="danger" 
            @click="archiveGroup" 
            :loading="isArchiving"
          >
            📦 Archive
          </BaseButton>
        </div>
      </BaseCard>
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
  margin-bottom: var(--spacing-sm);
}

.back-link:hover {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

.page-header h1 {
  font-size: 2rem;
}

.warning-banner {
  padding: var(--spacing-md);
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-warning);
  margin-bottom: var(--spacing-xl);
}

.message {
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-lg);
}

.message.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--color-error);
}

.message.success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: var(--color-success);
}

form > * {
  margin-bottom: var(--spacing-lg);
}

.form-group {
  margin-bottom: var(--spacing-md);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-lg);
}

.form-row-3 {
  grid-template-columns: 1fr 1fr 1fr;
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

.name-input-row {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
}

.name-input-row .input {
  flex: 1;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.hint {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-top: var(--spacing-xs);
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.radio-option:has(input:checked) {
  border-color: var(--color-primary);
  background: rgba(16, 185, 129, 0.05);
}

.radio-option input {
  margin-top: 4px;
}

.radio-content {
  display: flex;
  flex-direction: column;
}

.radio-title {
  font-weight: 500;
}

.radio-desc {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.toggle-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.toggle {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
}

.toggle input {
  width: 20px;
  height: 20px;
  accent-color: var(--color-primary);
}

.toggle-label {
  color: var(--color-text-primary);
}

.slider {
  width: 100%;
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  appearance: none;
}

.slider::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  cursor: pointer;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-md);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
}

@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

.danger-zone :deep(.base-card) {
  border-color: rgba(239, 68, 68, 0.3);
}

.danger-zone :deep(.card-body) {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.danger-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  position: relative;
  z-index: 1;
}

.danger-item + .danger-item {
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
}

.danger-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  flex: 1;
}

.danger-info strong {
  color: var(--color-text-primary);
}

.danger-item :deep(.btn) {
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}
</style>







