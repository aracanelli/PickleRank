<script setup lang="ts">
import { ref, watch } from 'vue'
import { Link2, Unlink, CheckCircle2 } from 'lucide-vue-next'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import { spondApi } from '../services/spond.api'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import { useToast } from '@/app/core/ui/composables/useToast'

const open = defineModel<boolean>({ required: true })
const toast = useToast()

const isLoading = ref(false)
const isSubmitting = ref(false)
const connected = ref(false)
const connectedEmail = ref<string | null>(null)
const email = ref('')
const password = ref('')
const error = ref('')

watch(open, (isOpen) => {
  if (isOpen) void loadStatus()
})

async function loadStatus() {
  isLoading.value = true
  error.value = ''
  try {
    const status = await spondApi.status()
    connected.value = status.connected
    connectedEmail.value = status.email ?? null
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load Spond status')
  } finally {
    isLoading.value = false
  }
}

async function connect() {
  if (!email.value.trim() || !password.value) return
  isSubmitting.value = true
  error.value = ''
  try {
    const status = await spondApi.connect(email.value.trim(), password.value)
    connected.value = status.connected
    connectedEmail.value = status.email ?? null
    password.value = ''
    toast.success('Spond account connected')
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Could not connect to Spond')
  } finally {
    isSubmitting.value = false
  }
}

async function disconnect() {
  isSubmitting.value = true
  error.value = ''
  try {
    await spondApi.disconnect()
    connected.value = false
    connectedEmail.value = null
    email.value = ''
    toast.info('Spond account disconnected')
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Could not disconnect')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Sheet
    v-model="open"
    title="Connect Spond"
  >
    <div class="flex flex-col gap-5">
      <p class="text-sm text-ink-muted">
        Connect your Spond account once to import event attendees when creating games. Your
        credentials are encrypted and stored securely on the server — they are never shown again.
      </p>

      <!-- Connected state -->
      <div
        v-if="connected"
        class="flex items-center gap-3 rounded-xl border border-win/30 bg-win/10 px-4 py-3"
      >
        <CheckCircle2 class="size-5 shrink-0 text-win" />
        <div class="min-w-0">
          <p class="text-sm font-semibold text-ink">
            Connected
          </p>
          <p class="truncate text-sm text-ink-faint">
            {{ connectedEmail }}
          </p>
        </div>
      </div>

      <!-- Connect form -->
      <form
        v-else
        class="flex flex-col gap-3"
        @submit.prevent="connect"
      >
        <AppInput
          v-model="email"
          label="Spond email"
          type="email"
          inputmode="email"
          autocomplete="username"
          placeholder="you@example.com"
        />
        <AppInput
          v-model="password"
          label="Spond password"
          type="password"
          autocomplete="current-password"
          placeholder="••••••••"
        />
        <p class="text-xs text-ink-faint">
          Note: accounts with two-factor authentication enabled cannot be connected.
        </p>
      </form>

      <p
        v-if="error"
        class="text-sm text-loss"
      >
        {{ error }}
      </p>
    </div>

    <template #footer>
      <AppButton
        v-if="connected"
        variant="secondary"
        block
        :loading="isSubmitting"
        @click="disconnect"
      >
        <Unlink class="size-4" />
        Disconnect Spond
      </AppButton>
      <AppButton
        v-else
        block
        :loading="isSubmitting || isLoading"
        :disabled="!email.trim() || !password"
        @click="connect"
      >
        <Link2 class="size-4" />
        Connect
      </AppButton>
    </template>
  </Sheet>
</template>
