<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './AppHeader.vue'
import BottomTabBar from './BottomTabBar.vue'
import AccountSheet from './AccountSheet.vue'
import ToastHost from '@/app/core/ui/components/ToastHost.vue'
import ConfirmSheet from '@/app/core/ui/components/ConfirmSheet.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const authStore = useAuthStore()

const accountSheetOpen = ref(false)

// Route meta drives the chrome: 'global' | 'group' | 'none'
const nav = computed(() => (route.meta.nav as 'global' | 'group' | 'none' | undefined) ?? 'none')
const showChrome = computed(() => nav.value !== 'none' && authStore.isAuthenticated)
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-surface-page">
    <AppHeader v-if="showChrome" :context="nav === 'group' ? 'group' : 'global'" @account="accountSheetOpen = true" />

    <!-- pb reserves space for the mobile bottom tab bar -->
    <main class="flex-1" :class="showChrome ? 'pb-24 md:pb-10' : ''">
      <slot />
    </main>

    <BottomTabBar
      v-if="showChrome"
      :context="nav === 'group' ? 'group' : 'global'"
      @account="accountSheetOpen = true"
    />

    <AccountSheet v-model="accountSheetOpen" />
    <ToastHost />
    <ConfirmSheet />
  </div>
</template>
