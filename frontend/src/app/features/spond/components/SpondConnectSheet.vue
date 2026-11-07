<script setup lang="ts">
import { ref, watch, useId } from 'vue'
import { CircleCheck } from 'lucide-vue-next'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiField from '@/app/core/ui/UiField.vue'
import UiState from '@/app/core/ui/UiState.vue'
import { confirm, toast } from '@/app/core/ui/feedback'
import { spondApi } from '../services/spond.api'
import type { SpondStatusDto } from '@/app/core/models/dto'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; change: [status: SpondStatusDto] }>()

const formId = useId()
const status = ref<SpondStatusDto | null>(null)
const loadError = ref('')
const email = ref('')
// Secret: kept only in this ref, cleared on success and on close; never logged or put in a URL.
const password = ref('')
const error = ref('')
const busy = ref(false)

const msg = (e: unknown, fallback: string) => (e as { message?: string }).message || fallback

async function load() {
  status.value = null
  loadError.value = ''
  try {
    status.value = await spondApi.status()
  } catch (e) {
    loadError.value = msg(e, 'Check your connection and try again.')
  }
}

watch(() => props.open, isOpen => {
  error.value = ''
  password.value = ''
  if (isOpen) void load()
})

function set(s: SpondStatusDto) {
  status.value = s
  emit('change', s)
}

async function connect() {
  if (busy.value) return
  if (!email.value.trim() || !password.value) {
    error.value = 'Enter your Spond email and password.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const s = await spondApi.connect(email.value.trim(), password.value)
    password.value = ''
    set(s)
    toast('Spond connected')
  } catch (e) {
    error.value = msg(e, 'Spond didn\'t connect. Check your email and password and try again.')
  } finally {
    busy.value = false
  }
}

async function disconnect() {
  const ok = await confirm({
    title: 'Disconnect Spond?',
    body: 'PickleRank deletes your saved Spond sign-in. You can connect again any time.',
    confirmLabel: 'Disconnect Spond',
    danger: true
  })
  if (!ok) return
  busy.value = true
  error.value = ''
  try {
    await spondApi.disconnect()
    email.value = ''
    set({ connected: false })
    toast('Spond disconnected')
  } catch (e) {
    error.value = msg(e, 'Spond didn\'t disconnect. Try again.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiSheet :open="open" title="Spond" description="Import who said yes to a Spond event when you start an event." @close="emit('close')">
    <UiState v-if="loadError" kind="error" title="Spond status didn't load" :body="loadError" @retry="load" />
    <UiState v-else-if="!status" kind="loading" title="Checking Spond" />

    <div v-else-if="status.connected" class="ok" role="status">
      <CircleCheck :size="22" aria-hidden="true" class="ok__icon" />
      <div class="ok__text">
        <strong>Connected</strong>
        <span class="truncate muted">{{ status.email }}</span>
      </div>
    </div>

    <form v-else :id="formId" class="form" novalidate @submit.prevent="connect">
      <UiField v-model="email" label="Spond email" type="email" inputmode="email" autocomplete="username" required />
      <UiField
        v-model="password"
        label="Spond password"
        type="password"
        autocomplete="current-password"
        required
        hint="Saved encrypted on our server and never shown again. Accounts with two-step sign-in can't connect."
      />
    </form>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <template v-if="status && !loadError" #actions>
      <UiButton v-if="status.connected" variant="danger" block :loading="busy" @click="disconnect">Disconnect Spond</UiButton>
      <UiButton v-else type="submit" :form="formId" variant="primary" block :loading="busy">Connect Spond</UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--s4); }
.ok {
  display: flex; align-items: center; gap: var(--s3);
  padding: var(--s3);
  border-radius: var(--r-control);
  background: var(--ok-tint);
}
.ok__icon { color: var(--ok); flex: none; }
.ok__text { display: flex; flex-direction: column; min-width: 0; }
.error { color: var(--bad); font-weight: 700; margin-top: var(--s3); }
</style>
