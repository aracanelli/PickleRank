<script setup lang="ts">
import { ref, watch } from 'vue'
import { LogOut, Check } from 'lucide-vue-next'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import ThemeToggle from '@/app/core/ui/components/ThemeToggle.vue'
import { useAuthStore } from '@/stores/auth'
import { signOut, getClerk, getSessions, switchSession } from '@/app/core/auth/clerk'

const open = defineModel<boolean>({ required: true })

const authStore = useAuthStore()

// Multi-account session list (Clerk); refreshed each time the sheet opens
const activeSessions = ref<ReturnType<typeof getSessions>>([])

watch(open, (isOpen) => {
  if (isOpen && getClerk()) {
    activeSessions.value = getSessions()
  }
})

async function handleSwitchAccount(sessionId: string) {
  open.value = false
  await switchSession(sessionId)
}

async function handleSignOut() {
  open.value = false
  await signOut()
}
</script>

<template>
  <Sheet v-model="open" title="Account">
    <div class="flex flex-col gap-5">
      <!-- Identity -->
      <div class="flex items-center gap-3">
        <Avatar :name="authStore.userName || '?'" size="lg" brand />
        <div class="min-w-0">
          <p class="truncate font-semibold text-ink">{{ authStore.userName }}</p>
          <p class="truncate text-sm text-ink-faint">{{ authStore.userEmail }}</p>
        </div>
      </div>

      <!-- Theme -->
      <div class="flex flex-col gap-2">
        <span class="text-xs font-semibold uppercase tracking-wide text-ink-faint">Appearance</span>
        <ThemeToggle />
      </div>

      <!-- Account switcher -->
      <div v-if="activeSessions.length > 1" class="flex flex-col gap-2">
        <span class="text-xs font-semibold uppercase tracking-wide text-ink-faint">Switch account</span>
        <div class="overflow-hidden rounded-xl border border-line">
          <button
            v-for="session in activeSessions"
            :key="session.id"
            type="button"
            class="flex min-h-12 w-full items-center gap-3 border-b border-line px-3 text-left transition-colors last:border-b-0 hover:bg-surface-2"
            @click="handleSwitchAccount(session.id)"
          >
            <Avatar
              :name="session.user?.firstName || session.user?.emailAddresses?.[0]?.emailAddress || '?'"
              size="sm"
            />
            <span class="flex-1 truncate text-sm font-medium text-ink">
              {{ session.user?.firstName || session.user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'User' }}
            </span>
            <Check v-if="session.id === authStore.session?.id" class="size-4 text-brand" />
          </button>
        </div>
      </div>

      <!-- Sign out -->
      <button
        type="button"
        class="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-loss/30 font-semibold text-loss transition-colors hover:bg-loss/10"
        @click="handleSignOut"
      >
        <LogOut class="size-4" />
        Sign out
      </button>
    </div>
  </Sheet>
</template>
