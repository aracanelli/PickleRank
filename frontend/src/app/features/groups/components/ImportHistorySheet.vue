<script setup lang="ts">
import { ref, watch } from 'vue'
import { Download, CheckCircle } from 'lucide-vue-next'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import { useToast } from '@/app/core/ui/composables/useToast'

const props = defineProps<{
  groupId: string
}>()

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ imported: [] }>()

const toast = useToast()

const importFile = ref<File | null>(null)
const isImporting = ref(false)
const error = ref('')
const importResult = ref<{ eventsCreated: number; gamesImported: number } | null>(null)

watch(open, (isOpen) => {
  if (isOpen) {
    importFile.value = null
    importResult.value = null
    error.value = ''
  }
})

async function downloadTemplate() {
  try {
    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()
    const token = await authStore.getToken()

    const response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL || ''}/api/groups/${props.groupId}/history/import/template`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

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
    toast.error(e.message || 'Failed to download template')
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

    const response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL || ''}/api/groups/${props.groupId}/history/import`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Import failed' }))
      throw new Error(errorData.detail || `HTTP ${response.status}`)
    }

    importResult.value = await response.json()
    toast.success('History imported')
    emit('imported')
  } catch (e: any) {
    error.value = e.message || 'Failed to import history'
  } finally {
    isImporting.value = false
  }
}
</script>

<template>
  <Sheet v-model="open" title="Import history" :persistent="isImporting">
    <div class="flex flex-col gap-4">
      <div class="flex flex-col items-start gap-3 rounded-xl bg-surface-2 p-4">
        <p class="text-sm text-ink-muted">
          Import historical game data from a CSV file. Download the template to see the required
          format.
        </p>
        <AppButton variant="secondary" size="sm" @click="downloadTemplate">
          <Download class="size-4" />
          Download template
        </AppButton>
      </div>

      <div
        v-if="error"
        class="rounded-xl border border-loss/30 bg-loss/10 p-4 text-sm text-loss"
      >
        <strong class="mb-1 block">Error</strong>
        <pre class="whitespace-pre-wrap break-words font-sans">{{ error }}</pre>
      </div>

      <div v-if="importResult" class="rounded-xl border border-win/30 bg-win/10 p-4">
        <div class="mb-2 flex items-center gap-2 text-win">
          <CheckCircle class="size-5" />
          <span class="font-semibold">Import successful</span>
        </div>
        <p class="text-sm text-ink font-mono tabular-nums">
          {{ importResult.eventsCreated }} events created
        </p>
        <p class="text-sm text-ink font-mono tabular-nums">
          {{ importResult.gamesImported }} games imported
        </p>
      </div>

      <div v-else class="flex flex-col gap-1.5">
        <label class="text-sm font-medium text-ink">Select CSV file</label>
        <input
          type="file"
          accept=".csv"
          class="block w-full cursor-pointer rounded-xl border border-line bg-surface-1 p-2.5 text-sm text-ink file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
          @change="handleFileSelect"
        />
        <p v-if="importFile" class="text-sm text-ink-muted">{{ importFile.name }}</p>
      </div>
    </div>
    <template #footer>
      <div class="flex gap-2">
        <AppButton variant="secondary" block :disabled="isImporting" @click="open = false">
          {{ importResult ? 'Close' : 'Cancel' }}
        </AppButton>
        <AppButton
          v-if="!importResult"
          block
          :loading="isImporting"
          :disabled="!importFile"
          @click="importHistory"
        >
          Import
        </AppButton>
      </div>
    </template>
  </Sheet>
</template>
