<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { CheckCircle, AlertTriangle } from 'lucide-vue-next'
import { playersApi } from '../services/players.api'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppTextarea from '@/app/core/ui/components/AppTextarea.vue'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ created: [] }>()

const names = ref('')
const isCreating = ref(false)
const error = ref('')
const result = ref<{ created: number; skipped: string[]; errors: string[] } | null>(null)

watch(open, (isOpen) => {
  if (isOpen) {
    names.value = ''
    result.value = null
    error.value = ''
  }
})

const nameCount = computed(
  () => names.value.split('\n').map((n) => n.trim()).filter((n) => n.length > 0).length
)

async function bulkCreate() {
  const list = names.value.split('\n').map((n) => n.trim()).filter((n) => n.length > 0)
  if (list.length === 0) return

  isCreating.value = true
  result.value = null
  error.value = ''
  try {
    const response = await playersApi.bulkCreate({ names: list })
    result.value = {
      created: response.created.length,
      skipped: response.skipped,
      errors: response.errors
    }
    emit('created')
    // All created cleanly: close after a beat so the user sees the result (ported behavior)
    if (response.skipped.length === 0 && response.errors.length === 0) {
      setTimeout(() => {
        open.value = false
      }, 1500)
    }
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to create players')
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <Sheet v-model="open" title="Bulk add players" :persistent="isCreating">
    <div class="flex flex-col gap-4">
      <div v-if="error" class="rounded-[14px] border border-loss/30 bg-loss/10 p-3 text-sm text-loss">
        {{ error }}
      </div>

      <AppTextarea
        v-model="names"
        :label="`Player names${nameCount > 0 ? ` (${nameCount})` : ''}`"
        :rows="8"
        placeholder="John Smith&#10;Jane Doe&#10;Mike Johnson&#10;Sarah Williams"
        hint="One name per line. Duplicate names will be skipped."
        :disabled="isCreating"
      />

      <div v-if="result" class="flex flex-col gap-2 rounded-[14px] bg-surface-2 p-4 text-sm">
        <p v-if="result.created > 0" class="flex items-center gap-2 font-medium text-win">
          <CheckCircle class="size-4" />
          Successfully created {{ result.created }} player{{ result.created !== 1 ? 's' : '' }}
        </p>
        <div v-if="result.skipped.length > 0" class="text-warn">
          <p class="flex items-center gap-2 font-medium"><AlertTriangle class="size-4" /> Skipped (already exist):</p>
          <ul class="mt-1 list-disc pl-6">
            <li v-for="name in result.skipped" :key="name">{{ name }}</li>
          </ul>
        </div>
        <div v-if="result.errors.length > 0" class="text-loss">
          <p class="flex items-center gap-2 font-medium"><AlertTriangle class="size-4" /> Errors:</p>
          <ul class="mt-1 list-disc pl-6">
            <li v-for="err in result.errors" :key="err">{{ err }}</li>
          </ul>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex gap-2">
        <AppButton variant="secondary" block :disabled="isCreating" @click="open = false">
          {{ result ? 'Done' : 'Cancel' }}
        </AppButton>
        <AppButton
          v-if="!result || result.skipped.length > 0 || result.errors.length > 0"
          block
          :loading="isCreating"
          :disabled="nameCount === 0"
          @click="bulkCreate"
        >
          Add {{ nameCount || '' }} player{{ nameCount !== 1 ? 's' : '' }}
        </AppButton>
      </div>
    </template>
  </Sheet>
</template>
