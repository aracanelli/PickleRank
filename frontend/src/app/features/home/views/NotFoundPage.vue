<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import UiState from '@/app/core/ui/UiState.vue'

const auth = useAuthStore()
</script>

<template>
  <div class="page">
    <UiState
      kind="empty"
      heading="h1"
      title="This page doesn’t exist"
      body="The link may be old or mistyped."
      :action-label="auth.isAuthenticated ? 'Go to your leagues' : 'Go to the home page'"
      :action-to="auth.isAuthenticated ? '/groups' : '/'"
    />
  </div>
</template>
