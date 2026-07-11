<script lang="ts">
import type { MatchHistoryEntryDto } from '@/app/core/models/dto'

export interface EventEditData {
  id: string
  name: string
  date: string
  matches: MatchHistoryEntryDto[]
}
</script>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { AlertTriangle, Trash2 } from 'lucide-vue-next'
import { eventsApi } from '@/app/features/events/services/events.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { useToast } from '@/app/core/ui/composables/useToast'
import { useConfirm } from '@/app/core/ui/composables/useConfirm'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppSelect from '@/app/core/ui/components/AppSelect.vue'
import IconButton from '@/app/core/ui/components/IconButton.vue'
import SegmentedControl from '@/app/core/ui/components/SegmentedControl.vue'

interface PendingScoreChange {
  scoreTeam1?: number
  scoreTeam2?: number
}

type PlayerPosition = 'team1P1' | 'team1P2' | 'team2P1' | 'team2P2'

interface PendingPlayerSwap {
  team1P1: string
  team1P2: string
  team2P1: string
  team2P2: string
}

const props = defineProps<{
  event: EventEditData | null
  groupId: string
}>()

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const { confirm } = useConfirm()

// State (ported from EventEditModal)
const isSaving = ref(false)
const pendingChanges = ref<Map<string, PendingScoreChange>>(new Map())
const pendingSwaps = ref<Map<string, PendingPlayerSwap>>(new Map())
const deletedGameIds = ref<Set<string>>(new Set())
const error = ref('')
const activeRound = ref('0')

const isDirty = computed(
  () => pendingChanges.value.size > 0 || pendingSwaps.value.size > 0 || deletedGameIds.value.size > 0
)

const visibleMatches = computed(() => {
  if (!props.event) return []
  return props.event.matches.filter((m) => !deletedGameIds.value.has(m.gameId))
})

const roundOptions = computed(() => {
  const rounds = [...new Set(visibleMatches.value.map((m) => m.roundIndex))].sort((a, b) => a - b)
  return rounds.map((r) => ({ label: `Round ${r + 1}`, value: String(r) }))
})

const activeRoundMatches = computed(() =>
  visibleMatches.value.filter((m) => m.roundIndex === Number(activeRound.value))
)

// Name lookup from ALL games in the event (players may appear in several games)
const playerNameById = computed(() => {
  const names: Record<string, string> = {}
  if (props.event) {
    for (const m of props.event.matches) {
      names[m.team1Ids[0]] = m.team1[0]
      names[m.team1Ids[1]] = m.team1[1]
      names[m.team2Ids[0]] = m.team2[0]
      names[m.team2Ids[1]] = m.team2[1]
    }
  }
  return names
})

// Options for the 4-position re-team selects: every player in the event
const playerOptions = computed(() =>
  Object.entries(playerNameById.value)
    .map(([id, name]) => ({ label: name, value: id }))
    .sort((a, b) => a.label.localeCompare(b.label))
)

// Scores ------------------------------------------------------------------

function getDisplayScore(match: MatchHistoryEntryDto, team: 1 | 2): number | undefined {
  const pending = pendingChanges.value.get(match.gameId)
  if (pending) {
    return team === 1 ? pending.scoreTeam1 : pending.scoreTeam2
  }
  return team === 1 ? match.scoreTeam1 : match.scoreTeam2
}

function updateScore(match: MatchHistoryEntryDto, team: 1 | 2, value: string) {
  const parsed = parseFloat(value)
  const numValue = value === '' ? undefined : Number.isNaN(parsed) ? undefined : parsed
  const existing = pendingChanges.value.get(match.gameId) || {
    scoreTeam1: match.scoreTeam1,
    scoreTeam2: match.scoreTeam2
  }

  if (team === 1) existing.scoreTeam1 = numValue
  else existing.scoreTeam2 = numValue

  // Only track if different from original
  const hasChanged = existing.scoreTeam1 !== match.scoreTeam1 || existing.scoreTeam2 !== match.scoreTeam2
  if (hasChanged) pendingChanges.value.set(match.gameId, existing)
  else pendingChanges.value.delete(match.gameId)
}

// Player re-teams ----------------------------------------------------------

function getCurrentPlayers(match: MatchHistoryEntryDto): PendingPlayerSwap {
  const pending = pendingSwaps.value.get(match.gameId)
  if (pending) return pending
  return {
    team1P1: match.team1Ids[0],
    team1P2: match.team1Ids[1],
    team2P1: match.team2Ids[0],
    team2P2: match.team2Ids[1]
  }
}

function setPosition(match: MatchHistoryEntryDto, position: PlayerPosition, playerId: string) {
  const newPlayers = { ...getCurrentPlayers(match), [position]: playerId }
  const original = {
    team1P1: match.team1Ids[0],
    team1P2: match.team1Ids[1],
    team2P1: match.team2Ids[0],
    team2P2: match.team2Ids[1]
  }
  const hasChanged =
    newPlayers.team1P1 !== original.team1P1 ||
    newPlayers.team1P2 !== original.team1P2 ||
    newPlayers.team2P1 !== original.team2P1 ||
    newPlayers.team2P2 !== original.team2P2
  if (hasChanged) pendingSwaps.value.set(match.gameId, newPlayers)
  else pendingSwaps.value.delete(match.gameId)
}

function hasGameSwaps(gameId: string): boolean {
  return pendingSwaps.value.has(gameId)
}

// Deletions ----------------------------------------------------------------

async function deleteGame(gameId: string) {
  const ok = await confirm({
    title: 'Delete game?',
    message: 'This game will be permanently deleted when you save. You can undo before saving.',
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return
  deletedGameIds.value.add(gameId)
  pendingChanges.value.delete(gameId)
  pendingSwaps.value.delete(gameId)
}

function undoDelete(gameId: string) {
  deletedGameIds.value.delete(gameId)
}

// Close / dirty guard --------------------------------------------------------

function resetState() {
  pendingChanges.value.clear()
  pendingSwaps.value.clear()
  deletedGameIds.value.clear()
  error.value = ''
}

async function handleCancel() {
  if (isDirty.value) {
    const ok = await confirm({
      title: 'Discard changes?',
      message: 'You have unsaved changes. Are you sure you want to discard them?',
      confirmLabel: 'Discard',
      danger: true
    })
    if (!ok) return
  }
  resetState()
  open.value = false
}

// Prevent navigation away while dirty
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('beforeunload', handleBeforeUnload)
  } else {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    resetState()
  }
})

// Reset the active round when the event changes
watch(
  () => props.event?.matches,
  (matches) => {
    if (!matches || matches.length === 0) {
      activeRound.value = '0'
      return
    }
    const rounds = [...new Set(matches.map((m) => m.roundIndex))].sort((a, b) => a - b)
    activeRound.value = String(rounds.length > 0 ? rounds[0] : 0)
  },
  { immediate: true }
)

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

// Save (ported verbatim: deletions sequential, then updates + swaps parallel,
// abort on any failure, then one ratings recalculation) ----------------------

async function saveChanges() {
  if (!props.event) return

  isSaving.value = true
  error.value = ''

  const failures: Array<{ gameId: string; operation: string; message: string }> = []

  // 1. Apply game deletions sequentially
  for (const gameId of deletedGameIds.value) {
    try {
      await eventsApi.deleteGame(gameId)
    } catch (e: any) {
      failures.push({ gameId, operation: 'delete', message: e.message || 'Delete failed' })
    }
  }

  // 2. Run score updates and player swaps in parallel
  const scoreUpdatePromises = Array.from(pendingChanges.value.entries()).map(async ([gameId, changes]) => {
    try {
      await eventsApi.updateScore(gameId, {
        scoreTeam1: changes.scoreTeam1,
        scoreTeam2: changes.scoreTeam2
      })
      return { gameId, success: true as const }
    } catch (e: any) {
      return { gameId, success: false as const, message: e.message || 'Score update failed' }
    }
  })

  const swapPromises = Array.from(pendingSwaps.value.entries()).map(async ([gameId, players]) => {
    try {
      await eventsApi.updateGamePlayers(gameId, {
        team1P1: players.team1P1,
        team1P2: players.team1P2,
        team2P1: players.team2P1,
        team2P2: players.team2P2
      })
      return { gameId, success: true as const }
    } catch (e: any) {
      return { gameId, success: false as const, message: e.message || 'Player swap failed' }
    }
  })

  const parallelResults = await Promise.all([...scoreUpdatePromises, ...swapPromises])

  for (const result of parallelResults) {
    if (!result.success) {
      failures.push({ gameId: result.gameId, operation: 'update', message: result.message })
    }
  }

  // 3. If any failures, surface the error and do NOT proceed with success flow
  if (failures.length > 0) {
    const failedIds = [...new Set(failures.map((f) => f.gameId.slice(0, 8)))]
    error.value = `Failed operations for games: ${failedIds.join(', ')}. Check console for details.`
    console.error('Save failures:', failures)
    isSaving.value = false
    return
  }

  // 4. Only recalculate and emit success if no failures
  try {
    if (pendingChanges.value.size > 0 || pendingSwaps.value.size > 0 || deletedGameIds.value.size > 0) {
      await groupsApi.recalculateRatings(props.groupId)
    }

    resetState()
    toast.success('Event updated and ratings recalculated')
    emit('saved')
    open.value = false
  } catch (e: any) {
    error.value = e.message || 'Failed to recalculate ratings'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Sheet v-model="open" :title="event ? `Edit ${event.name}` : 'Edit event'" size="lg" :persistent="isDirty || isSaving">
    <div v-if="event" class="flex flex-col gap-4">
      <div
        v-if="error"
        class="flex items-start gap-2 rounded-xl border border-loss/30 bg-loss/10 px-3.5 py-3 text-sm text-loss"
      >
        <AlertTriangle class="mt-0.5 size-4 shrink-0" />
        <span>{{ error }}</span>
      </div>

      <div class="flex items-start gap-2 rounded-xl bg-warn/10 px-3.5 py-3 text-xs text-warn">
        <AlertTriangle class="mt-0.5 size-4 shrink-0" />
        <span>Changes to games will trigger a full rating recalculation for the entire group.</span>
      </div>

      <SegmentedControl v-if="roundOptions.length > 0" v-model="activeRound" :options="roundOptions" scrollable />

      <div class="flex flex-col gap-3">
        <div
          v-for="match in activeRoundMatches"
          :key="match.gameId"
          class="rounded-xl border bg-surface-2 p-3.5"
          :class="hasGameSwaps(match.gameId) ? 'border-warn border-dashed' : 'border-line'"
        >
          <div class="mb-3 flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Court {{ match.courtIndex + 1 }}
            </span>
            <IconButton label="Delete game" variant="danger" @click="deleteGame(match.gameId)">
              <Trash2 class="size-4" />
            </IconButton>
          </div>

          <div class="flex flex-col gap-3">
            <!-- Team 1 -->
            <div class="flex items-stretch gap-3">
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <span class="text-[10px] font-bold uppercase tracking-widest text-ink-faint">Team 1</span>
                <AppSelect
                  :model-value="getCurrentPlayers(match).team1P1"
                  :options="playerOptions"
                  @update:model-value="(v) => setPosition(match, 'team1P1', String(v))"
                />
                <AppSelect
                  :model-value="getCurrentPlayers(match).team1P2"
                  :options="playerOptions"
                  @update:model-value="(v) => setPosition(match, 'team1P2', String(v))"
                />
              </div>
              <input
                type="number"
                min="0"
                placeholder="0"
                inputmode="numeric"
                aria-label="Team 1 score"
                class="w-16 shrink-0 self-end rounded-xl border border-line bg-surface-1 py-2.5 text-center font-mono text-2xl font-bold tabular-nums text-brand focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                :value="getDisplayScore(match, 1)"
                @input="updateScore(match, 1, ($event.target as HTMLInputElement).value)"
              />
            </div>

            <div class="text-center text-xs font-bold uppercase tracking-widest text-ink-faint">vs</div>

            <!-- Team 2 -->
            <div class="flex items-stretch gap-3">
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <span class="text-[10px] font-bold uppercase tracking-widest text-ink-faint">Team 2</span>
                <AppSelect
                  :model-value="getCurrentPlayers(match).team2P1"
                  :options="playerOptions"
                  @update:model-value="(v) => setPosition(match, 'team2P1', String(v))"
                />
                <AppSelect
                  :model-value="getCurrentPlayers(match).team2P2"
                  :options="playerOptions"
                  @update:model-value="(v) => setPosition(match, 'team2P2', String(v))"
                />
              </div>
              <input
                type="number"
                min="0"
                placeholder="0"
                inputmode="numeric"
                aria-label="Team 2 score"
                class="w-16 shrink-0 self-end rounded-xl border border-line bg-surface-1 py-2.5 text-center font-mono text-2xl font-bold tabular-nums text-brand focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                :value="getDisplayScore(match, 2)"
                @input="updateScore(match, 2, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Pending deletions with undo -->
      <div v-if="deletedGameIds.size > 0" class="rounded-xl border border-loss/30 bg-loss/10 p-3.5">
        <h4 class="text-sm font-semibold text-loss">Pending deletions ({{ deletedGameIds.size }})</h4>
        <p class="mt-0.5 text-xs text-ink-faint">These games will be permanently deleted when you save.</p>
        <div
          v-for="gameId in deletedGameIds"
          :key="gameId"
          class="mt-2 flex items-center justify-between gap-3"
        >
          <span class="font-mono text-sm text-ink-muted">Game {{ gameId.slice(0, 8) }}…</span>
          <AppButton variant="ghost" size="sm" @click="undoDelete(gameId)">Undo</AppButton>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center gap-3">
        <span v-if="isDirty" class="mr-auto text-xs font-medium text-warn">Unsaved changes</span>
        <AppButton variant="secondary" :disabled="isSaving" @click="handleCancel">Cancel</AppButton>
        <AppButton :loading="isSaving" :disabled="!isDirty" @click="saveChanges">Save &amp; recalculate</AppButton>
      </div>
    </template>
  </Sheet>
</template>
