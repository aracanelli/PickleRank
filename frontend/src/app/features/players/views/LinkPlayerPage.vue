<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { playersApi } from '../services/players.api'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import { CheckCircle, AlertCircle } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const isLoading = ref(true)
const error = ref('')
const success = ref(false)
const linkedPlayer = ref<any>(null)

onMounted(async () => {
  const token = route.query.token as string
  if (!token) {
    error.value = 'Invalid invite link'
    isLoading.value = false
    return
  }
  
  try {
    const player = await playersApi.linkPlayer(token)
    linkedPlayer.value = player
    success.value = true
  } catch (e: any) {
    error.value = e.message || 'Failed to link player'
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="container link-page">
    <BaseCard class="result-card">
        <LoadingSpinner v-if="isLoading" text="Linking player..." />
        
        <div v-else-if="success" class="result success">
            <CheckCircle :size="48" class="icon" />
            <h1>Linked Successfully!</h1>
            <p>You have been linked to player <strong>{{ linkedPlayer.displayName }}</strong>.</p>
            <BaseButton @click="router.push('/groups')">Go to Dashboard</BaseButton>
        </div>
        
        <div v-else class="result error">
            <AlertCircle :size="48" class="icon" />
            <h1>Linking Failed</h1>
            <p>{{ error }}</p>
            <BaseButton variant="secondary" @click="router.push('/groups')">Go to Dashboard</BaseButton>
        </div>
    </BaseCard>
  </div>
</template>

<style scoped>
.link-page {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
}
.result-card {
    width: 100%;
    max-width: 500px;
}
.result {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--spacing-lg);
    padding: var(--spacing-lg);
}
.success .icon { color: var(--color-success, #10b981); }
.error .icon { color: var(--color-error, #ef4444); }
h1 { color: var(--color-text-primary); font-size: 1.5rem; }
p { color: var(--color-text-secondary); }
</style>
