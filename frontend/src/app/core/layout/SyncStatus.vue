<script setup lang="ts">
/**
 * A slim bar above the page for connection and sync state, plus a sheet for changes the server
 * refused. In the page flow (not floating) so it never covers a back link or header button.
 * Hidden when online with nothing waiting: the normal state shows nothing.
 */
import { ref, computed, watch } from 'vue'
import { CloudOff, RefreshCw, AlertTriangle } from 'lucide-vue-next'
import { outbox, syncState } from '@/app/core/offline/sync'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'

const open = ref(false)
// A normal save takes a fraction of a second: only say "Syncing" when it is taking a while.
const slow = ref(false)
let slowTimer: ReturnType<typeof setTimeout> | undefined
watch(() => syncState.value.pending > 0, busy => {
  clearTimeout(slowTimer)
  slow.value = false
  if (busy) slowTimer = setTimeout(() => { slow.value = true }, 1500)
}, { immediate: true })
const failed = computed(() => outbox.ops.filter(o => o.failed))

const changes = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'}`
const label = computed(() => {
  const { pending, failed: f, offline } = syncState.value
  if (f) return `${changes(f)} didn't sync`
  if (offline) return pending ? `Offline · ${changes(pending)} on this phone` : 'Offline · showing saved data'
  if (pending && slow.value) return `Syncing ${changes(pending)}…`
  return ''
})
const kind = computed(() => (syncState.value.failed ? 'bad' : syncState.value.offline ? 'off' : 'sync'))

watch(() => failed.value.length, n => { if (!n) open.value = false })


</script>

<template>
  <button v-if="label && kind === 'bad'" type="button" class="bar bar--bad" @click="open = true">
    <AlertTriangle :size="16" aria-hidden="true" />
    <span>{{ label }}</span>
    <span class="bar__go">Review</span>
  </button>
  <div v-else-if="label" class="bar" :class="`bar--${kind}`" role="status">
    <CloudOff v-if="kind === 'off'" :size="14" aria-hidden="true" />
    <RefreshCw v-else :size="14" class="spin" aria-hidden="true" />
    <span>{{ label }}</span>
  </div>

  <UiSheet
    :open="open"
    title="Changes that didn't sync"
    description="The server didn't accept these. They are still saved on this phone: try again, or discard the ones you don't need."
    @close="open = false"
  >
    <ul class="list">
      <li v-for="op in failed" :key="op.id" class="row">
        <div class="row__text">
          <strong>{{ op.label }}</strong>
          <span>{{ op.error }}</span>
        </div>
        <UiButton size="md" @click="outbox.retry(op.id)">Retry</UiButton>
        <UiButton size="md" variant="quiet" @click="outbox.discard(op.id)">Discard</UiButton>
      </li>
    </ul>
    <template #actions>
      <UiButton variant="primary" size="lg" block @click="outbox.retryAll()">Retry all</UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 32px;
  padding: calc(var(--safe-top) + 4px) 16px 4px;
  border: 0;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 700;
  text-align: center;
  animation: bar-in 160ms var(--ease);
}
button.bar { min-height: var(--tap); cursor: pointer; }
.bar__go { text-decoration: underline; text-underline-offset: 3px; }
.bar--off { background: var(--ink); color: var(--bg); }
.bar--sync { background: var(--court-tint); color: var(--court); }
.bar--bad { background: var(--bad); color: var(--surface); }
.spin { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes bar-in { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .spin, .bar { animation: none; } }

.list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s3); }
.row { display: flex; align-items: center; gap: var(--s2); }
.row__text { flex: 1; min-width: 0; display: grid; gap: 2px; }
.row__text span { color: var(--ink-2); font-size: var(--text-sm); }
</style>
