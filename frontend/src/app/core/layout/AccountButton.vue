<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { LogOut, Check, LayoutList } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { signOut, getSessions, switchSession } from '@/app/core/auth/clerk'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'

const auth = useAuthStore()
const open = ref(false)
const sessions = computed<any[]>(() => (open.value ? getSessions() : []))

async function choose(id: string) {
  open.value = false
  await switchSession(id)
}

async function doSignOut() {
  open.value = false
  await signOut()
}
</script>

<template>
  <button type="button" class="avatar" :aria-label="`${auth.userInitials}, account menu`" @click="open = true">
    <span>{{ auth.userInitials }}</span>
  </button>
  <UiSheet :open="open" title="Account" :description="auth.userEmail || undefined" @close="open = false">
    <div class="acct">
      <RouterLink to="/groups" class="acct__row" @click="open = false">
        <LayoutList :size="20" aria-hidden="true" /> All leagues
      </RouterLink>
      <template v-if="sessions.length > 1">
        <h3 class="acct__h">Switch account</h3>
        <button
          v-for="s in sessions"
          :key="s.id"
          type="button"
          class="acct__row"
          :aria-current="s.user?.id === auth.userId ? 'true' : undefined"
          @click="choose(s.id)"
        >
          <span class="truncate">{{ s.user?.primaryEmailAddress?.emailAddress || s.user?.fullName || 'Account' }}</span>
          <Check v-if="s.user?.id === auth.userId" :size="18" aria-hidden="true" />
        </button>
      </template>
    </div>
    <template #actions>
      <UiButton variant="danger" block @click="doSignOut"><LogOut :size="18" aria-hidden="true" /> Sign out</UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.avatar {
  width: var(--tap); height: var(--tap);
  border-radius: 50%;
  border: 2px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
  font-weight: 700;
  font-size: min(var(--text-sm), 18px);
  display: grid; place-items: center;
  flex: none;
  overflow: hidden;
}
.acct { display: flex; flex-direction: column; gap: var(--s1); }
.acct__h { font-size: var(--text-sm); color: var(--ink-2); margin-top: var(--s3); }
.acct__row {
  display: flex; align-items: center; gap: var(--s3);
  justify-content: space-between;
  min-height: var(--tap-lg);
  padding: 0 var(--s3);
  border-radius: var(--r-control);
  border: 0;
  background: var(--surface-sunk);
  color: var(--ink);
  font-weight: 700;
  text-decoration: none;
  text-align: left;
}
.acct__row:first-child { justify-content: flex-start; }
</style>
