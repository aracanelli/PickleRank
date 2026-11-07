<script setup lang="ts">
/** Pick a nominee for one category. Tapping a player casts (or changes) the vote. */
import { ref, computed, watch } from 'vue'
import { Check } from 'lucide-vue-next'
import type { GroupPlayerDto } from '@/app/core/models/dto'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiField from '@/app/core/ui/UiField.vue'

const props = defineProps<{
  open: boolean
  players: GroupPlayerDto[]
  /** The caller's current pick (group-player id), if any. */
  currentVote?: string | null
  title?: string
  description?: string
  /** Group-player id whose vote is being saved. */
  saving?: string | null
}>()

const emit = defineEmits<{ close: []; select: [groupPlayerId: string] }>()

const query = ref('')
watch(() => props.open, isOpen => { if (isOpen) query.value = '' })

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = [...props.players].sort((a, b) => a.displayName.localeCompare(b.displayName))
  return q ? list.filter(p => p.displayName.toLowerCase().includes(q)) : list
})
</script>

<template>
  <UiSheet :open="open" :title="title ? `Vote: ${title}` : 'Cast your vote'" :description="description" @close="emit('close')">
    <UiField v-model="query" label="Find a player" inputmode="search" type="search" autocomplete="off" />
    <ul role="list" class="picks" aria-label="Players">
      <li v-for="p in filtered" :key="p.id">
        <button
          type="button"
          class="pick"
          :class="{ 'pick--on': p.id === currentVote }"
          :aria-pressed="p.id === currentVote"
          :disabled="!!saving"
          :aria-busy="saving === p.id || undefined"
          @click="emit('select', p.id)"
        >
          <span class="truncate pick__name">{{ p.displayName }}</span>
          <span v-if="p.id === currentVote" class="pick__mine">
            <Check :size="18" aria-hidden="true" />Your vote
          </span>
          <span v-else-if="saving === p.id" class="muted">Saving</span>
        </button>
      </li>
    </ul>
    <p v-if="!filtered.length" class="muted empty">No players match "{{ query }}".</p>
  </UiSheet>
</template>

<style scoped>
.picks { display: flex; flex-direction: column; margin-top: var(--s3); }
.pick {
  display: flex;
  align-items: center;
  gap: var(--s3);
  width: 100%;
  min-height: 52px;
  padding: 0 var(--s3);
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  text-align: left;
}
.pick:hover:not(:disabled) { background: var(--surface-sunk); }
.pick:disabled { cursor: progress; }
.pick--on { background: var(--court-tint); border-radius: var(--r-control); }
.pick__name { flex: 1; min-width: 0; font-weight: 700; }
.pick__mine { display: inline-flex; align-items: center; gap: var(--s1); flex: none; font-size: var(--text-sm); font-weight: 700; color: var(--court); }
.empty { padding: var(--s4) 0; }
</style>
