<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { GameDto, PlayerInfo } from '@/app/core/models/dto'
import { eventsApi } from '../services/events.api'
import { useToast } from '@/app/core/ui/composables/useToast'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import { useAsyncAction } from '@/app/core/ui/composables/useAsyncAction'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppSelect from '@/app/core/ui/components/AppSelect.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'

const props = defineProps<{
  game: GameDto | null
  /** Every player in the event (from all games) — selectable in any slot. */
  allPlayers: PlayerInfo[]
  groupId: string
}>()

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ updated: [] }>()

const toast = useToast()

const slots = reactive({ team1P1: '', team1P2: '', team2P1: '', team2P2: '' })

function syncFromGame() {
  slots.team1P1 = props.game?.team1[0]?.id ?? ''
  slots.team1P2 = props.game?.team1[1]?.id ?? ''
  slots.team2P1 = props.game?.team2[0]?.id ?? ''
  slots.team2P2 = props.game?.team2[1]?.id ?? ''
}

watch(open, (isOpen) => {
  if (isOpen) syncFromGame()
})
watch(() => props.game?.id, syncFromGame)

const playerOptions = computed(() =>
  [...props.allPlayers]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((p) => ({ label: p.displayName, value: p.id }))
)

const slotIds = computed(() => [slots.team1P1, slots.team1P2, slots.team2P1, slots.team2P2])

const validationError = computed(() => {
  if (slotIds.value.some((id) => !id)) return 'All four positions must be filled'
  if (new Set(slotIds.value).size !== 4) return 'Each position needs a different player'
  return ''
})

const { run: save, loading: isSaving } = useAsyncAction(async () => {
  if (!props.game || validationError.value) return
  try {
    await eventsApi.updateGamePlayers(
      props.game.id,
      { team1P1: slots.team1P1, team1P2: slots.team1P2, team2P1: slots.team2P1, team2P2: slots.team2P2 },
      props.groupId
    )
    toast.success('Teams updated')
    open.value = false
    emit('updated')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to update teams'))
  }
})
</script>

<template>
  <Sheet v-model="open" :title="game ? `Edit teams · Court ${game.courtIndex + 1}` : 'Edit teams'">
    <div v-if="game" class="flex flex-col gap-4">
      <section
        v-for="team in [1, 2] as const"
        :key="team"
        class="flex flex-col gap-3 rounded-xl border border-line bg-surface-2/50 p-4"
      >
        <h3 class="text-sm font-semibold text-ink">Team {{ team }}</h3>
        <template v-if="team === 1">
          <AppSelect v-model="slots.team1P1" label="Player 1" :options="playerOptions" />
          <AppSelect v-model="slots.team1P2" label="Player 2" :options="playerOptions" />
        </template>
        <template v-else>
          <AppSelect v-model="slots.team2P1" label="Player 1" :options="playerOptions" />
          <AppSelect v-model="slots.team2P2" label="Player 2" :options="playerOptions" />
        </template>
      </section>

      <p v-if="validationError" class="text-sm text-loss">{{ validationError }}</p>
      <p v-else class="text-sm text-ink-faint">
        Changing teams may recalculate ELO for entered scores.
      </p>
    </div>

    <template #footer>
      <AppButton block :loading="isSaving" :disabled="!!validationError" @click="save()">
        Save teams
      </AppButton>
    </template>
  </Sheet>
</template>
