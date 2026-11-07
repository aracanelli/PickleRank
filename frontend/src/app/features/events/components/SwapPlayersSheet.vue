<script setup lang="ts">
/** Swap two players within one round (e.g. a late arrival, or someone needs a break). */
import { ref, computed, watch } from 'vue'
import { Check } from 'lucide-vue-next'
import type { GameDto } from '@/app/core/models/dto'
import { eventsApi } from '../services/events.api'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import { toast, announce } from '@/app/core/ui/feedback'
import { roundPlayers } from '../liveEdits'

const props = defineProps<{ open: boolean; eventId: string; roundIndex: number; games: GameDto[] }>()
const emit = defineEmits<{ close: []; swapped: [] }>()

const picked = ref<string[]>([])
const busy = ref(false)
watch(() => props.open, o => { if (o) picked.value = [] })

const players = computed(() => roundPlayers(props.games))
const courtOf = (id: string) => props.games.find(g => [...g.team1, ...g.team2].some(p => p.id === id))?.courtIndex
const nameOf = (id: string) => players.value.find(p => p.id === id)?.displayName ?? ''

function toggle(id: string) {
  if (picked.value.includes(id)) picked.value = picked.value.filter(x => x !== id)
  else if (picked.value.length < 2) picked.value = [...picked.value, id]
  else announce('Two players are already picked. Unpick one first.')
}

const label = computed(() =>
  picked.value.length === 2 ? `Swap ${nameOf(picked.value[0])} and ${nameOf(picked.value[1])}` : `Pick ${2 - picked.value.length} more`
)

async function swap() {
  if (picked.value.length !== 2 || busy.value) return
  busy.value = true
  try {
    const res = await eventsApi.swap(props.eventId, { roundIndex: props.roundIndex, player1Id: picked.value[0], player2Id: picked.value[1] })
    for (const w of res.warnings ?? []) toast(w, 'bad')
    toast('Players swapped')
    emit('swapped')
  } catch (e) {
    toast((e as { message?: string }).message || 'Players not swapped', 'bad')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiSheet :open="open" :title="`Swap two players in round ${roundIndex + 1}`" description="They trade places on their courts for this round only." @close="emit('close')">
    <ul role="list" class="list">
      <li v-for="p in players" :key="p.id">
        <label class="pick" :class="{ 'pick--on': picked.includes(p.id) }">
          <input type="checkbox" :checked="picked.includes(p.id)" @change="toggle(p.id)">
          <span class="pick__box" aria-hidden="true"><Check v-if="picked.includes(p.id)" :size="18" /></span>
          <span class="pick__name truncate">{{ p.displayName }}</span>
          <span class="muted pick__court">Court <span class="num">{{ (courtOf(p.id) ?? 0) + 1 }}</span></span>
        </label>
      </li>
    </ul>
    <template #actions>
      <UiButton variant="primary" size="lg" block :disabled="picked.length !== 2" :loading="busy" @click="swap">{{ label }}</UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.list { display: flex; flex-direction: column; list-style: none; padding: 0; margin: 0; }
.pick {
  position: relative;
  display: flex; align-items: center; gap: var(--s3);
  min-height: 52px; padding: 0 var(--s1);
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}
.pick input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
.pick__box {
  width: 26px; height: 26px; flex: none; display: grid; place-items: center;
  border: 2px solid var(--line-strong); border-radius: 6px; background: var(--surface);
}
.pick--on .pick__box { background: var(--court); border-color: var(--court); color: var(--on-court); }
.pick__name { flex: 1; }
.pick--on .pick__name { font-weight: 700; }
.pick__court { font-size: var(--text-sm); flex: none; }
.pick:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: -3px; border-radius: 6px; }
</style>
