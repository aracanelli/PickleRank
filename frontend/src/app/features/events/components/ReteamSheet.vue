<script setup lang="ts">
/** Change who plays on one court. Blocks anyone already playing elsewhere that round. */
import { reactive, computed, watch, useId } from 'vue'
import type { EventDto, GameDto } from '@/app/core/models/dto'
import { eventsApi } from '../services/events.api'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import { toast } from '@/app/core/ui/feedback'
import { eventPlayers, validateTeams, type Slots } from '../liveEdits'

const props = defineProps<{ open: boolean; event: EventDto; game: GameDto | null }>()
const emit = defineEmits<{ close: []; updated: [] }>()

const id = useId()
const slots = reactive<Slots>({ team1P1: '', team1P2: '', team2P1: '', team2P2: '' })
const state = reactive({ busy: false, tried: false })

watch(() => [props.open, props.game?.id] as const, ([o]) => {
  if (!o || !props.game) return
  slots.team1P1 = props.game.team1[0]?.id ?? ''
  slots.team1P2 = props.game.team1[1]?.id ?? ''
  slots.team2P1 = props.game.team2[0]?.id ?? ''
  slots.team2P2 = props.game.team2[1]?.id ?? ''
  state.tried = false
}, { immediate: true })

const players = computed(() => eventPlayers(props.event))
const names = computed(() => new Map(players.value.map(p => [p.id, p.displayName])))
const round = computed(() => props.game ? props.event.games.filter(g => g.roundIndex === props.game!.roundIndex) : [])
const error = computed(() => (props.game ? validateTeams(slots, props.game, round.value, names.value) : ''))

const seats: Array<{ key: keyof Slots; label: string }> = [
  { key: 'team1P1', label: 'Team one, first player' },
  { key: 'team1P2', label: 'Team one, second player' },
  { key: 'team2P1', label: 'Team two, first player' },
  { key: 'team2P2', label: 'Team two, second player' }
]

async function save() {
  state.tried = true
  if (!props.game || error.value || state.busy) return
  state.busy = true
  try {
    await eventsApi.updateGamePlayers(props.game.id, { ...slots }, props.event.groupId)
    toast(`Court ${props.game.courtIndex + 1} teams changed`)
    emit('updated')
  } catch (e) {
    toast((e as { message?: string }).message || 'Teams not changed', 'bad')
  } finally {
    state.busy = false
  }
}
</script>

<template>
  <UiSheet
    :open="open"
    :title="game ? `Change players on court ${game.courtIndex + 1}` : 'Change players'"
    :description="game ? `Round ${game.roundIndex + 1}. A saved score on this court stays with the court.` : undefined"
    @close="emit('close')"
  >
    <form v-if="game" class="seats" novalidate @submit.prevent="save">
      <template v-for="(s, i) in seats" :key="s.key">
        <div v-if="i === 2" class="net" aria-hidden="true" />
        <div class="seat">
          <label :for="`${id}-${s.key}`">{{ s.label }}</label>
          <select :id="`${id}-${s.key}`" v-model="slots[s.key]" :aria-invalid="state.tried && !!error || undefined">
            <option value="" disabled>Choose a player</option>
            <option v-for="p in players" :key="p.id" :value="p.id">{{ p.displayName }}</option>
          </select>
        </div>
      </template>
      <p v-if="state.tried && error" class="err" role="alert">{{ error }}</p>
    </form>
    <template #actions>
      <UiButton variant="primary" size="lg" block :loading="state.busy" @click="save">
        Save court {{ game ? game.courtIndex + 1 : '' }} players
      </UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.seats { display: flex; flex-direction: column; gap: var(--s3); }
.seat { display: flex; flex-direction: column; gap: var(--s1); }
label { font-weight: 700; font-size: var(--text-sm); }
select {
  min-height: var(--tap);
  padding: 0 var(--s3);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-control);
  background: var(--surface);
  color: var(--ink);
}
select[aria-invalid='true'] { border-color: var(--bad); }
.net { height: 2px; margin: var(--s1) 0; background: repeating-linear-gradient(90deg, var(--net) 0 6px, transparent 6px 10px); }
.err { color: var(--bad); font-weight: 700; font-size: var(--text-sm); }
</style>
