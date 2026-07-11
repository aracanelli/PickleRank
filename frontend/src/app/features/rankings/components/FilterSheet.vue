<script lang="ts">
export interface HistoryFilters {
  from: string
  to: string
  eventId: string
  playerId: string
  secondaryPlayerId: string
  relationship: 'teammate' | 'opponent'
}

export const emptyFilters = (): HistoryFilters => ({
  from: '',
  to: '',
  eventId: '',
  playerId: '',
  secondaryPlayerId: '',
  relationship: 'teammate'
})
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GroupPlayerDto, EventListItemDto } from '@/app/core/models/dto'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppSelect from '@/app/core/ui/components/AppSelect.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import SegmentedControl from '@/app/core/ui/components/SegmentedControl.vue'

const props = defineProps<{
  filters: HistoryFilters
  players: GroupPlayerDto[]
  events: EventListItemDto[]
}>()

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ apply: [filters: HistoryFilters] }>()

// Draft state edited inside the sheet; synced from applied filters on open
const draft = ref<HistoryFilters>(emptyFilters())

watch(open, (isOpen) => {
  if (isOpen) draft.value = { ...props.filters }
})

// Clearing the primary player also clears the secondary (ported legacy semantics)
watch(
  () => draft.value.playerId,
  (playerId) => {
    if (!playerId) {
      draft.value.secondaryPlayerId = ''
      draft.value.relationship = 'teammate'
    }
  }
)

const sortedPlayers = computed(() =>
  [...props.players].sort((a, b) => a.displayName.localeCompare(b.displayName))
)

const playerOptions = computed(() => [
  { label: 'All players', value: '' },
  ...sortedPlayers.value.map((p) => ({ label: p.displayName, value: p.playerId }))
])

const secondaryPlayerOptions = computed(() => [
  { label: 'Any second player', value: '' },
  ...sortedPlayers.value
    .filter((p) => p.playerId !== draft.value.playerId)
    .map((p) => ({ label: p.displayName, value: p.playerId }))
])

const eventOptions = computed(() => [
  { label: 'All events', value: '' },
  ...props.events.map((e) => ({
    label: e.name || (e.startsAt ? new Date(e.startsAt).toLocaleDateString() : 'Event'),
    value: e.id
  }))
])

const relationshipOptions = [
  { label: 'Teammate', value: 'teammate' },
  { label: 'Opponent', value: 'opponent' }
]

// Relationship only applies when both players are picked (legacy semantics)
const relationshipEnabled = computed(() => !!draft.value.playerId && !!draft.value.secondaryPlayerId)

// SegmentedControl models a plain string; bridge to the narrowed union type
const relationshipModel = computed({
  get: () => draft.value.relationship as string,
  set: (value: string) => {
    draft.value.relationship = value === 'opponent' ? 'opponent' : 'teammate'
  }
})

function clearAll() {
  draft.value = emptyFilters()
}

function apply() {
  const next = { ...draft.value }
  // Secondary filter only applies when a primary player is selected
  if (!next.playerId) {
    next.secondaryPlayerId = ''
    next.relationship = 'teammate'
  }
  emit('apply', next)
  open.value = false
}
</script>

<template>
  <Sheet v-model="open" title="Filter history">
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3">
        <AppInput v-model="draft.from" type="date" label="From" />
        <AppInput v-model="draft.to" type="date" label="To" />
      </div>

      <AppSelect v-model="draft.eventId" label="Event" :options="eventOptions" />

      <AppSelect v-model="draft.playerId" label="Player" :options="playerOptions" />

      <AppSelect
        v-model="draft.secondaryPlayerId"
        label="With / against"
        hint="Pick a player first to combine with a second player."
        :options="secondaryPlayerOptions"
        :disabled="!draft.playerId"
      />

      <div class="flex flex-col gap-1.5" :class="relationshipEnabled ? '' : 'pointer-events-none opacity-50'">
        <span class="text-sm font-medium text-ink">Relationship</span>
        <SegmentedControl v-model="relationshipModel" :options="relationshipOptions" />
      </div>
    </div>

    <template #footer>
      <div class="flex gap-3">
        <AppButton variant="secondary" block @click="clearAll">Clear all</AppButton>
        <AppButton block @click="apply">Apply</AppButton>
      </div>
    </template>
  </Sheet>
</template>
