<script setup lang="ts">
import { ref, computed, watch, useId } from 'vue'
import { RouterLink } from 'vue-router'
import { LogOut, Check, LayoutList, CircleHelp, CalendarSync, ChevronRight } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore, type ThemePreference } from '@/stores/theme'
import { signOut, getSessions, switchSession } from '@/app/core/auth/clerk'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import HelpSheet from './HelpSheet.vue'
import SpondConnectSheet from '@/app/features/spond/components/SpondConnectSheet.vue'
import { spondApi } from '@/app/features/spond/services/spond.api'
import type { SpondStatusDto } from '@/app/core/models/dto'

const auth = useAuthStore()
const theme = useThemeStore()
const themeHeadId = useId()
const open = ref(false)
const helpOpen = ref(false)
const spondOpen = ref(false)
const spond = ref<SpondStatusDto | null>(null)
const sessions = computed<any[]>(() => (open.value ? getSessions() : []))

const themes: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match phone' }
]

const spondLabel = computed(() =>
  !spond.value ? 'Import who\'s coming to an event' : spond.value.connected ? `Connected as ${spond.value.email}` : 'Not connected'
)

watch(open, async isOpen => {
  if (!isOpen) return
  try { spond.value = await spondApi.status() } catch { spond.value = null }
})

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
        <LayoutList :size="20" aria-hidden="true" /> <span class="acct__label">All leagues</span>
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
          <span class="acct__label truncate">{{ s.user?.primaryEmailAddress?.emailAddress || s.user?.fullName || 'Account' }}</span>
          <Check v-if="s.user?.id === auth.userId" :size="18" aria-hidden="true" />
        </button>
      </template>

      <h3 :id="themeHeadId" class="acct__h">Appearance</h3>
      <div class="seg" role="group" :aria-labelledby="themeHeadId">
        <button
          v-for="t in themes"
          :key="t.value"
          type="button"
          class="seg__btn"
          :aria-pressed="theme.preference === t.value"
          @click="theme.setPreference(t.value)"
        >{{ t.label }}</button>
      </div>

      <button type="button" class="acct__row acct__gap" @click="spondOpen = true">
        <CalendarSync :size="20" aria-hidden="true" />
        <span class="acct__label acct__two">
          <span>Spond</span>
          <span class="muted acct__sub truncate">{{ spondLabel }}</span>
        </span>
        <ChevronRight :size="20" aria-hidden="true" />
      </button>
      <button type="button" class="acct__row" @click="helpOpen = true">
        <CircleHelp :size="20" aria-hidden="true" />
        <span class="acct__label">How PickleRank works</span>
        <ChevronRight :size="20" aria-hidden="true" />
      </button>
    </div>
    <template #actions>
      <UiButton variant="danger" block @click="doSignOut"><LogOut :size="18" aria-hidden="true" /> Sign out</UiButton>
    </template>
  </UiSheet>

  <!-- opened on top of the account sheet so closing returns focus to the row that opened it -->
  <HelpSheet :open="helpOpen" @close="helpOpen = false" />
  <SpondConnectSheet :open="spondOpen" @close="spondOpen = false" @change="spond = $event" />
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
  min-height: var(--tap-lg);
  padding: var(--s1) var(--s3);
  border-radius: var(--r-control);
  border: 0;
  background: var(--surface-sunk);
  color: var(--ink);
  font-weight: 700;
  text-decoration: none;
  text-align: left;
}
.acct__label { flex: 1; min-width: 0; }
.acct__gap { margin-top: var(--s4); }
.acct__two { display: flex; flex-direction: column; }
.acct__sub { font-weight: 400; font-size: var(--text-sm); }

.seg {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border-radius: var(--r-control);
  background: var(--surface-sunk);
}
.seg__btn {
  min-height: var(--tap);
  padding: 0 var(--s1);
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-2);
  font-weight: 700;
  line-height: 1.1;
}
.seg__btn[aria-pressed='true'] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.12); }
</style>
