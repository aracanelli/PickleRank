<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Activity, AlertCircle, Loader2 } from 'lucide-vue-next'
import { playersApi } from '../services/players.api'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import { useToast } from '@/app/core/ui/composables/useToast'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const isLoading = ref(true)
const error = ref('')

onMounted(async () => {
  const token = route.query.token as string
  if (!token) {
    error.value = 'Invalid invite link'
    isLoading.value = false
    return
  }

  try {
    const player = await playersApi.linkPlayer(token)
    toast.success(`Linked to player ${player.displayName}`)
    router.replace('/groups')
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to link player')
    isLoading.value = false
  }
})
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center bg-surface-page px-4 py-10 pt-safe pb-safe">
    <RouterLink to="/" class="mb-8 flex items-center gap-2 text-2xl font-bold text-ink">
      <Activity class="size-7 text-brand" aria-hidden="true" />
      PickleRank
    </RouterLink>

    <div class="w-full max-w-md rounded-2xl border border-line bg-surface-1 p-6 shadow-sm">
      <div v-if="isLoading" class="flex flex-col items-center gap-3 py-8 text-center">
        <Loader2 class="size-8 animate-spin text-brand" aria-hidden="true" />
        <p class="text-sm text-ink-muted">Linking your account...</p>
      </div>

      <div v-else class="flex flex-col items-center gap-4 py-4 text-center">
        <div class="flex size-12 items-center justify-center rounded-2xl bg-loss/10 text-loss">
          <AlertCircle class="size-6" />
        </div>
        <h1 class="text-lg font-semibold text-ink">Linking failed</h1>
        <p class="text-sm text-ink-muted">{{ error }}</p>
        <AppButton variant="secondary" @click="router.push('/groups')">Go to dashboard</AppButton>
      </div>
    </div>
  </div>
</template>
