<script setup lang="ts">
import { Activity } from 'lucide-vue-next'
import AppButton from '@/app/core/ui/components/AppButton.vue'
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface-page px-6 text-center">
    <Activity class="size-14 text-brand" aria-hidden="true" />
    <h1 class="text-5xl font-bold text-ink">404</h1>
    <p class="text-ink-muted">Oops! Looks like this ball went out of bounds.</p>
    <RouterLink to="/">
      <AppButton>Back to home</AppButton>
    </RouterLink>
  </div>
</template>
