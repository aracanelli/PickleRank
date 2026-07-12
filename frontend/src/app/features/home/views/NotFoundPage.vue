<script setup lang="ts">
import { Activity } from 'lucide-vue-next'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import CourtLines from '@/app/core/ui/components/CourtLines.vue'
</script>

<template>
  <div
    class="relative flex min-h-dvh flex-col items-center justify-center gap-4 overflow-hidden bg-surface-page px-6 text-center"
  >
    <CourtLines crop="full" class="absolute left-1/2 top-1/2 h-72 w-auto -translate-x-1/2 -translate-y-1/2" />
    <Activity class="relative size-12 text-accent-text" aria-hidden="true" />
    <p class="eyebrow relative text-ink-faint">Out of bounds</p>
    <h1 class="display-wide relative text-7xl text-ink">404</h1>
    <div class="kitchen-line relative w-40" />
    <p class="relative text-ink-muted">Oops! Looks like this ball went out of bounds.</p>
    <RouterLink to="/" class="relative">
      <AppButton>Back to home</AppButton>
    </RouterLink>
  </div>
</template>
