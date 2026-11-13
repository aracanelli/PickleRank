<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { CheckCircle2, AlertTriangle } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useLeagueStore } from '@/stores/league'
import TabBar from './TabBar.vue'
import SyncStatus from './SyncStatus.vue'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import { liveRegion, confirmState, settleConfirm, toastState } from '@/app/core/ui/feedback'

const route = useRoute()
const auth = useAuthStore()
const league = useLeagueStore()

// Any route with a groupId becomes the remembered league.
watch(() => route.params.groupId, id => {
  if (typeof id === 'string' && id) void league.load(id)
}, { immediate: true })

const showTabs = computed(() =>
  auth.isAuthenticated && (route.meta.chrome === 'home' || (route.meta.chrome === 'league' && !!league.groupId))
)
</script>

<template>
  <a class="skip" href="#main">Skip to content</a>
  <TabBar v-if="showTabs" />
  <main id="main" tabindex="-1" :class="{ 'has-tabs': showTabs }">
    <SyncStatus v-if="auth.isAuthenticated" />
    <slot />
  </main>

  <div class="visually-hidden" aria-live="polite" aria-atomic="true">{{ liveRegion.polite }}</div>
  <div class="visually-hidden" aria-live="assertive" aria-atomic="true">{{ liveRegion.assertive }}</div>

  <div v-if="toastState.message" :key="toastState.id" class="toast" :class="`toast--${toastState.kind}`" aria-hidden="true">
    <CheckCircle2 v-if="toastState.kind === 'ok'" :size="20" />
    <AlertTriangle v-else :size="20" />
    <span>{{ toastState.message }}</span>
  </div>

  <UiSheet
    :open="confirmState.open"
    size="alert"
    :title="confirmState.options?.title || ''"
    :description="confirmState.options?.body"
    close-label="Cancel"
    @close="settleConfirm(false)"
  >
    <template #actions>
      <UiButton :variant="confirmState.options?.danger ? 'danger' : 'primary'" size="lg" block data-autofocus @click="settleConfirm(true)">
        {{ confirmState.options?.confirmLabel }}
      </UiButton>
      <UiButton variant="quiet" size="lg" block @click="settleConfirm(false)">
        {{ confirmState.options?.cancelLabel || 'Cancel' }}
      </UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.skip {
  position: absolute;
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  left: 8px; top: -100px;
  z-index: 100;
  padding: var(--s2) var(--s3);
  background: var(--surface);
  color: var(--court);
  font-weight: 700;
  border-radius: var(--r-control);
}
.skip:focus { top: calc(8px + var(--safe-top)); }
/* column so a page fills the screen and its ActionBar sits in the thumb zone even on short pages */
main { display: flex; flex-direction: column; min-height: 100dvh; }
main:focus { outline: none; }
main.has-tabs { padding-bottom: calc(var(--tabbar-space) + var(--s2)); }
/* a screen with an ActionBar above the tabs already reserves the tab zone inside that bar */
main.has-tabs:has(.actionbar--tabs) { padding-bottom: 0; }

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(var(--tabbar-space) + var(--s4) + var(--kb-inset, 0px));
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: var(--s2);
  max-width: calc(100vw - 32px);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-tile);
  background: var(--ink);
  color: var(--bg);
  font-weight: 700;
  box-shadow: var(--shadow-float);
  animation: toast-in 180ms var(--ease);
}
.toast--bad { background: var(--bad); color: var(--surface); }
@keyframes toast-in { from { opacity: 0; transform: translate(-50%, 8px); } }
</style>
