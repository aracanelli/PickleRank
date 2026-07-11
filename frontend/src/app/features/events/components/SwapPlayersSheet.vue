<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check } from 'lucide-vue-next'
import type { GameDto, PlayerInfo } from '@/app/core/models/dto'
import { eventsApi } from '../services/events.api'
import { useToast } from '@/app/core/ui/composables/useToast'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'

const props = defineProps<{
  eventId: string
  roundIndex: number
  /** Games of the selected round — every player in them can be swapped. */
  roundGames: GameDto[]
}>()

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ swapped: [] }>()

const toast = useToast()
const selectedIds = ref<string[]>([])
const isSwapping = ref(false)

watch(open, (isOpen) => {
  if (isOpen) selectedIds.value = []
})

// Group-player ids come from game.team1/team2 PlayerInfo
const roundPlayers = computed<PlayerInfo[]>(() => {
  const seen = new Map<string, PlayerInfo>()
  for (const game of props.roundGames) {
    for (const p of [...game.team1, ...game.team2]) {
      if (!seen.has(p.id)) seen.set(p.id, p)
    }
  }
  return [...seen.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
})

function toggle(id: string) {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((x) => x !== id)
  } else if (selectedIds.value.length < 2) {
    selectedIds.value = [...selectedIds.value, id]
  }
}

const canSwap = computed(() => selectedIds.value.length === 2)

async function performSwap() {
  if (!canSwap.value || isSwapping.value) return
  isSwapping.value = true
  try {
    const result = await eventsApi.swap(props.eventId, {
      roundIndex: props.roundIndex,
      player1Id: selectedIds.value[0],
      player2Id: selectedIds.value[1]
    })
    for (const warning of result.warnings) toast.warning(warning)
    toast.success('Players swapped')
    open.value = false
    emit('swapped')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to swap players'))
  } finally {
    isSwapping.value = false
  }
}
</script>

<template>
  <Sheet v-model="open" :title="`Swap players · Round ${roundIndex + 1}`">
    <div class="flex flex-col gap-3">
      <p class="text-sm text-ink-muted">
        Pick two players in this round to trade places — their court and team assignments are exchanged.
      </p>
      <div class="flex flex-col gap-1.5">
        <button
          v-for="player in roundPlayers"
          :key="player.id"
          type="button"
          class="flex min-h-11 w-full items-center gap-3 rounded-xl border bg-surface-1 px-3 py-2 text-left transition-colors"
          :class="[
            selectedIds.includes(player.id)
              ? 'border-brand ring-2 ring-brand/40'
              : 'border-line hover:bg-surface-2',
            !selectedIds.includes(player.id) && selectedIds.length >= 2 ? 'opacity-50' : ''
          ]"
          :aria-pressed="selectedIds.includes(player.id)"
          @click="toggle(player.id)"
        >
          <Avatar :name="player.displayName" size="sm" :brand="selectedIds.includes(player.id)" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink">{{ player.displayName }}</span>
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors"
            :class="selectedIds.includes(player.id) ? 'border-brand bg-brand text-brand-contrast' : 'border-line-strong text-transparent'"
            aria-hidden="true"
          >
            <Check class="size-4" />
          </span>
        </button>
      </div>
    </div>

    <template #footer>
      <AppButton block :loading="isSwapping" :disabled="!canSwap" @click="performSwap">
        {{ canSwap ? 'Swap players' : `Select ${2 - selectedIds.length} player${selectedIds.length === 1 ? '' : 's'}` }}
      </AppButton>
    </template>
  </Sheet>
</template>
