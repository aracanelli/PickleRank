<script setup lang="ts">
/** Import past games from a CSV (moved here from the old league home). */
import { ref, useId } from 'vue'
import { Download, CheckCircle2 } from 'lucide-vue-next'
import UiButton from '@/app/core/ui/UiButton.vue'
import { announce, toast } from '@/app/core/ui/feedback'
import { downloadTemplate, importHistory, type ImportResult } from './historyImport'

const props = defineProps<{ groupId: string }>()
const emit = defineEmits<{ imported: [] }>()

const fileId = useId()
const file = ref<File | null>(null)
const input = ref<HTMLInputElement | null>(null)
const busy = ref<'template' | 'import' | null>(null)
const error = ref('')
const result = ref<ImportResult | null>(null)

function pick(e: Event) {
  file.value = (e.target as HTMLInputElement).files?.[0] ?? null
  error.value = ''
  result.value = null
}

async function getTemplate() {
  busy.value = 'template'
  error.value = ''
  try {
    await downloadTemplate(props.groupId)
  } catch (e) {
    error.value = (e as Error).message
    announce(error.value, true)
  } finally {
    busy.value = null
  }
}

async function run() {
  if (!file.value) return
  busy.value = 'import'
  error.value = ''
  result.value = null
  try {
    result.value = await importHistory(props.groupId, file.value)
    toast('History imported')
    file.value = null
    if (input.value) input.value.value = ''
    emit('imported')
  } catch (e) {
    error.value = (e as Error).message
    announce(error.value, true)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section class="section" aria-labelledby="import-h">
    <h2 id="import-h">Import past games</h2>
    <p class="muted">Bring in games played before this league used PickleRank. Fill in the template, then upload it.</p>
    <UiButton variant="secondary" :loading="busy === 'template'" @click="getTemplate">
      <Download :size="18" aria-hidden="true" /> Download CSV template
    </UiButton>
    <div class="file">
      <label :for="fileId">CSV file</label>
      <input :id="fileId" ref="input" type="file" accept=".csv,text/csv" @change="pick">
    </div>
    <UiButton variant="primary" :disabled="!file" :loading="busy === 'import'" @click="run">Import games</UiButton>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="result" class="done" role="status">
      <CheckCircle2 :size="20" aria-hidden="true" />
      <span>Imported. <span class="num">{{ result.eventsCreated }}</span> events created, <span class="num">{{ result.gamesImported }}</span> games imported.</span>
    </p>
  </section>
</template>

<style scoped>
.file { display: flex; flex-direction: column; gap: var(--s1); min-width: 0; }
.file label { font-weight: 700; font-size: var(--text-sm); }
.file input {
  width: 100%;
  min-height: var(--tap);
  padding: var(--s2);
  border: 2px dashed var(--line-strong);
  border-radius: var(--r-control);
  background: var(--surface);
  font-size: var(--text-md);
}
.file input:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
.error { color: var(--bad); font-weight: 700; }
.done { display: flex; gap: var(--s2); align-items: flex-start; padding: var(--s3); border-radius: var(--r-tile); background: var(--ok-tint); color: var(--ink); }
</style>
