<script setup lang="ts">
import { ref } from 'vue'
import { playersApi } from '../services/players.api'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import Modal from '@/app/core/ui/components/Modal.vue'
import { CheckCircle, AlertTriangle } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'success'): void
}>()

const bulkNames = ref('')
const isBulkCreating = ref(false)
const error = ref('')
const bulkResult = ref<{ created: number; skipped: string[] } | null>(null)

function closeBulkModal() {
    emit('update:open', false)
    // small delay to clear state so user doesn't see it disappear
    setTimeout(() => {
        bulkNames.value = ''
        bulkResult.value = null
        error.value = ''
    }, 200)
}

function getBulkNameCount(): number {
  return bulkNames.value
    .split('\n')
    .map(name => name.trim())
    .filter(name => name.length > 0).length
}

async function bulkCreatePlayers() {
  const names = bulkNames.value
    .split('\n')
    .map(name => name.trim())
    .filter(name => name.length > 0)

  if (names.length === 0) return

  isBulkCreating.value = true
  bulkResult.value = null
  error.value = ''

  try {
    const response = await playersApi.bulkCreate({ names })
    bulkResult.value = {
      created: response.created.length,
      skipped: response.skipped
    }
    
    // If all were created successfully, close modal after delay
    if (response.skipped.length === 0) {
      setTimeout(() => {
        closeBulkModal()
        emit('success')
      }, 1500)
    } else {
        // partial success, still emit success so list updates
        emit('success')
    }
    
  } catch (e: any) {
    error.value = e.message || 'Failed to create players'
  } finally {
    isBulkCreating.value = false
  }
}
</script>

<template>
    <Modal :open="open" title="Bulk Add Players" @close="closeBulkModal">
      <div class="bulk-instructions">
        <p>Enter player names, one per line. Duplicate names will be skipped.</p>
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>
      
      <div class="form-group">
        <label class="label">
          Player Names 
          <span v-if="getBulkNameCount() > 0" class="name-count">({{ getBulkNameCount() }} players)</span>
        </label>
        <textarea
          v-model="bulkNames"
          class="textarea bulk-textarea"
          placeholder="John Smith
Jane Doe
Mike Johnson
Sarah Williams"
          rows="10"
          :disabled="isBulkCreating"
        ></textarea>
      </div>

      <!-- Results -->
      <div v-if="bulkResult" class="bulk-result">
        <div v-if="bulkResult.created > 0" class="result-success">
          <CheckCircle :size="16" /> Successfully created {{ bulkResult.created }} player{{ bulkResult.created !== 1 ? 's' : '' }}
        </div>
        <div v-if="bulkResult.skipped.length > 0" class="result-skipped">
          <span class="result-label"><AlertTriangle :size="16" /> Skipped (already exist):</span>
          <ul>
            <li v-for="name in bulkResult.skipped" :key="name">{{ name }}</li>
          </ul>
        </div>
      </div>

      <template #footer>
        <BaseButton variant="secondary" @click="closeBulkModal">
          {{ bulkResult ? 'Done' : 'Cancel' }}
        </BaseButton>
        <BaseButton 
          v-if="!bulkResult || bulkResult.skipped.length > 0"
          :loading="isBulkCreating" 
          :disabled="getBulkNameCount() === 0"
          @click="bulkCreatePlayers"
        >
          Add {{ getBulkNameCount() }} Player{{ getBulkNameCount() !== 1 ? 's' : '' }}
        </BaseButton>
      </template>
    </Modal>
</template>

<style scoped>
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

.error-message {
  padding: var(--spacing-lg);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error);
  text-align: center;
  margin-bottom: var(--spacing-md);
}
</style>
