<script setup lang="ts">
import { ref, watch } from 'vue'
import { Delete } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  team1Names: string[]
  team2Names: string[]
  initialScore1?: number | null
  initialScore2?: number | null
}>()

const emit = defineEmits<{
  close: []
  save: [score1: number | undefined, score2: number | undefined]
}>()

// Active team (1 or 2)
const activeTeam = ref<1 | 2>(1)

// Score strings for display
const score1 = ref('')
const score2 = ref('')

// Initialize scores when modal opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    score1.value = props.initialScore1 != null ? String(props.initialScore1) : ''
    score2.value = props.initialScore2 != null ? String(props.initialScore2) : ''
    activeTeam.value = 1
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

function appendDigit(digit: number) {
  if (activeTeam.value === 1) {
    if (score1.value.length < 3) score1.value += digit
  } else {
    if (score2.value.length < 3) score2.value += digit
  }
}

function backspace() {
  if (activeTeam.value === 1) {
    score1.value = score1.value.slice(0, -1)
  } else {
    score2.value = score2.value.slice(0, -1)
  }
}

function clear() {
  if (activeTeam.value === 1) {
    score1.value = ''
  } else {
    score2.value = ''
  }
}

function switchTeam(team: 1 | 2) {
  activeTeam.value = team
}

function handleSave() {
  const s1 = score1.value ? parseInt(score1.value, 10) : undefined
  const s2 = score2.value ? parseInt(score2.value, 10) : undefined
  emit('save', s1, s2)
}

function handleClose() {
  emit('close')
}

function handleBackdropClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('score-modal-backdrop')) {
    handleClose()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="score-modal">
      <div v-if="open" class="score-modal-backdrop" @click="handleBackdropClick">
        <div class="score-modal">
          <!-- Score Display -->
          <div class="score-display">
            <div 
              class="team-block" 
              :class="{ active: activeTeam === 1 }"
              @click="switchTeam(1)"
            >
              <div class="team-names">
                <span v-for="name in team1Names" :key="name">{{ name }}</span>
              </div>
              <div class="team-score">{{ score1 || '-' }}</div>
            </div>
            
            <div class="vs-divider">VS</div>
            
            <div 
              class="team-block" 
              :class="{ active: activeTeam === 2 }"
              @click="switchTeam(2)"
            >
              <div class="team-names">
                <span v-for="name in team2Names" :key="name">{{ name }}</span>
              </div>
              <div class="team-score">{{ score2 || '-' }}</div>
            </div>
          </div>

          <!-- Numpad -->
          <div class="numpad">
            <button v-for="n in [1,2,3,4,5,6,7,8,9]" :key="n" class="numpad-btn" @click="appendDigit(n)">
              {{ n }}
            </button>
            <button class="numpad-btn clear-btn" @click="clear">C</button>
            <button class="numpad-btn" @click="appendDigit(0)">0</button>
            <button class="numpad-btn backspace-btn" @click="backspace">
              <Delete :size="24" />
            </button>
          </div>

          <!-- Actions -->
          <div class="modal-actions">
            <button class="action-btn cancel-btn" @click="handleClose">Cancel</button>
            <button class="action-btn save-btn" @click="handleSave">Save Score</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.score-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1001;
  padding-bottom: env(safe-area-inset-bottom);
}

.score-modal {
  background: var(--color-bg-card);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  width: 100%;
  max-width: 420px;
  padding: var(--spacing-lg);
  padding-bottom: calc(var(--spacing-lg) + env(safe-area-inset-bottom));
}

/* Score Display */
.score-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-md);
}

.team-block {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border-radius: var(--radius-lg);
  border: 2px solid var(--color-border);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.team-block.active {
  border-color: var(--color-primary);
  background: rgba(16, 185, 129, 0.1);
}

.team-names {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.team-score {
  font-size: 2.5rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--color-text-primary);
  min-width: 60px;
  text-align: center;
}

.team-block.active .team-score {
  color: var(--color-primary);
}

.vs-divider {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-muted);
  padding: 0 var(--spacing-sm);
}

/* Numpad */
.numpad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.numpad-btn {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.numpad-btn:active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  transform: scale(0.95);
}

.clear-btn {
  color: var(--color-warning);
}

.backspace-btn {
  color: var(--color-text-muted);
}

/* Actions */
.modal-actions {
  display: flex;
  gap: var(--spacing-md);
}

.action-btn {
  flex: 1;
  height: 52px;
  border-radius: var(--radius-lg);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: none;
}

.cancel-btn {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.cancel-btn:active {
  background: var(--color-bg-hover);
}

.save-btn {
  background: var(--color-primary);
  color: white;
}

.save-btn:active {
  background: var(--color-primary-hover);
  transform: scale(0.98);
}

/* Transitions */
.score-modal-enter-active,
.score-modal-leave-active {
  transition: opacity 0.2s ease;
}

.score-modal-enter-active .score-modal,
.score-modal-leave-active .score-modal {
  transition: transform 0.25s ease;
}

.score-modal-enter-from,
.score-modal-leave-to {
  opacity: 0;
}

.score-modal-enter-from .score-modal {
  transform: translateY(100%);
}

.score-modal-leave-to .score-modal {
  transform: translateY(100%);
}

/* Desktop: center the modal */
@media (min-width: 769px) {
  .score-modal-backdrop {
    align-items: center;
    padding: var(--spacing-lg);
  }

  .score-modal {
    border-radius: var(--radius-xl);
    max-width: 380px;
  }
}
</style>
