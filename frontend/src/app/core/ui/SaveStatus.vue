<script setup lang="ts">
import { Check, CircleDashed, AlertTriangle, Loader2 } from 'lucide-vue-next'

export type CourtState = 'needs' | 'saving' | 'saved' | 'failed' | 'final'
defineProps<{ state: CourtState; failedText?: string }>()
</script>

<template>
  <span class="status" :class="`status--${state}`">
    <Loader2 v-if="state === 'saving'" class="spin" :size="16" aria-hidden="true" />
    <Check v-else-if="state === 'saved' || state === 'final'" :size="16" aria-hidden="true" />
    <AlertTriangle v-else-if="state === 'failed'" :size="16" aria-hidden="true" />
    <CircleDashed v-else :size="16" aria-hidden="true" />
    <span v-if="state === 'saving'">Saving…</span>
    <span v-else-if="state === 'saved'">Saved</span>
    <span v-else-if="state === 'final'">Final</span>
    <span v-else-if="state === 'failed'">{{ failedText || 'Not saved. Tap to retry' }}</span>
    <span v-else>Needs score</span>
  </span>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm);
  font-weight: 700;
  padding: 2px 8px 2px 6px;
  border-radius: 6px;
}
.status--needs { color: var(--ink-2); }
.status--saving { color: var(--wait); background: var(--wait-tint); }
.status--saved { color: var(--ok); background: var(--ok-tint); }
.status--final { color: var(--ink-2); }
.status--failed { color: var(--bad); background: var(--bad-tint); }
.spin { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
