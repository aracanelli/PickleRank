<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Check, CheckCircle, AlertTriangle, UserPlus } from 'lucide-vue-next'
import { groupsApi } from '../services/groups.api'
import { playersApi } from '@/app/features/players/services/players.api'
import type { PlayerDto, MembershipType, SkillLevel, BulkAddPlayerItem } from '@/app/core/models/dto'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import AppBadge from '@/app/core/ui/components/AppBadge.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppTextarea from '@/app/core/ui/components/AppTextarea.vue'
import SegmentedControl from '@/app/core/ui/components/SegmentedControl.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import { useToast } from '@/app/core/ui/composables/useToast'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'

const props = defineProps<{
  groupId: string
  /** Player ids (global) already in the group — shown disabled. */
  existingPlayerIds: string[]
}>()

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ added: [] }>()

const toast = useToast()

const mode = ref('existing')
const modeOptions = [
  { label: 'Existing', value: 'existing' },
  { label: 'New player', value: 'new' },
  { label: 'Bulk paste', value: 'bulk' }
]

const allPlayers = ref<PlayerDto[]>([])
const isLoadingPlayers = ref(false)
const search = ref('')
const selected = ref(new Set<string>())

// Batch membership settings (skill only matters for subs — it sets their starting rating)
// Plain string refs: SegmentedControl's model is string; cast on submit.
const membershipType = ref('PERMANENT')
const skillLevel = ref('INTERMEDIATE')

// New player path
const newPlayerName = ref('')
const isCreating = ref(false)

// Bulk create path (ported from BulkPlayerCreateModal)
const bulkNames = ref('')
const isBulkCreating = ref(false)
const bulkResult = ref<{ created: number; skipped: string[]; errors: string[] } | null>(null)

const isSaving = ref(false)

watch(open, async (isOpen) => {
  if (!isOpen) return
  mode.value = 'existing'
  search.value = ''
  selected.value = new Set()
  membershipType.value = 'PERMANENT'
  skillLevel.value = 'INTERMEDIATE'
  newPlayerName.value = ''
  bulkNames.value = ''
  bulkResult.value = null
  await loadPlayers()
})

async function loadPlayers() {
  isLoadingPlayers.value = true
  try {
    allPlayers.value = (await playersApi.list()).players
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to load players'))
  } finally {
    isLoadingPlayers.value = false
  }
}

const existingIdSet = computed(() => new Set(props.existingPlayerIds))

const filteredPlayers = computed(() => {
  const q = search.value.trim().toLowerCase()
  const players = q
    ? allPlayers.value.filter((p) => p.displayName.toLowerCase().includes(q))
    : allPlayers.value
  // Selectable players first, already-in-group at the end
  return [...players].sort(
    (a, b) => Number(existingIdSet.value.has(a.id)) - Number(existingIdSet.value.has(b.id))
  )
})

function toggle(player: PlayerDto) {
  if (existingIdSet.value.has(player.id)) return
  const next = new Set(selected.value)
  if (next.has(player.id)) next.delete(player.id)
  else next.add(player.id)
  selected.value = next
}

async function createPlayer() {
  const name = newPlayerName.value.trim()
  if (!name) return
  isCreating.value = true
  try {
    const player = await playersApi.create({ displayName: name })
    allPlayers.value = [player, ...allPlayers.value]
    selected.value = new Set([...selected.value, player.id])
    newPlayerName.value = ''
    mode.value = 'existing'
    toast.success(`Created ${player.displayName}`)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to create player'))
  } finally {
    isCreating.value = false
  }
}

const bulkNameCount = computed(
  () => bulkNames.value.split('\n').map((n) => n.trim()).filter((n) => n.length > 0).length
)

async function bulkCreatePlayers() {
  const names = bulkNames.value.split('\n').map((n) => n.trim()).filter((n) => n.length > 0)
  if (names.length === 0) return
  isBulkCreating.value = true
  bulkResult.value = null
  try {
    const response = await playersApi.bulkCreate({ names })
    bulkResult.value = {
      created: response.created.length,
      skipped: response.skipped,
      errors: response.errors
    }
    if (response.created.length > 0) {
      allPlayers.value = [...response.created, ...allPlayers.value]
      selected.value = new Set([...selected.value, ...response.created.map((p) => p.id)])
    }
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to create players'))
  } finally {
    isBulkCreating.value = false
  }
}

async function addSelected() {
  if (selected.value.size === 0) return
  isSaving.value = true
  try {
    const players: BulkAddPlayerItem[] = [...selected.value].map((playerId) => ({
      playerId,
      membershipType: membershipType.value as MembershipType,
      skillLevel: membershipType.value === 'SUB' ? (skillLevel.value as SkillLevel) : undefined
    }))
    const response = await groupsApi.bulkAddPlayers(props.groupId, { players })
    const addedCount = response.added.length
    toast.success(`Added ${addedCount} player${addedCount !== 1 ? 's' : ''}`)
    open.value = false
    emit('added')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to add players'))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Sheet v-model="open" title="Add players" size="lg" :persistent="isSaving || isBulkCreating">
    <div class="flex flex-col gap-4">
      <SegmentedControl v-model="mode" :options="modeOptions" />

      <template v-if="mode === 'existing'">
        <AppInput v-model="search" type="search" inputmode="search" placeholder="Search players..." />
        <SkeletonList v-if="isLoadingPlayers" :rows="4" avatar />
        <AppEmptyState
          v-else-if="filteredPlayers.length === 0"
          title="No players found"
          :description="search ? 'Try a different search term.' : 'Create players with the New player or Bulk paste tabs.'"
        >
          <template #icon><UserPlus class="size-7" /></template>
        </AppEmptyState>
        <div v-else class="overflow-hidden rounded-[14px] border border-line bg-surface-1">
          <div class="divide-y divide-line">
            <button
              v-for="player in filteredPlayers"
              :key="player.id"
              type="button"
              class="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
              :class="
                existingIdSet.has(player.id)
                  ? 'opacity-50'
                  : 'cursor-pointer hover:bg-surface-2 active:bg-surface-2'
              "
              :disabled="existingIdSet.has(player.id)"
              @click="toggle(player)"
            >
              <Avatar :name="player.displayName" :seed="player.id" size="sm" :brand="selected.has(player.id)" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm font-medium text-ink">{{ player.displayName }}</span>
                <span v-if="player.notes" class="truncate text-sm text-ink-faint">{{ player.notes }}</span>
              </span>
              <AppBadge v-if="existingIdSet.has(player.id)" variant="muted">In group</AppBadge>
              <span
                v-else
                class="flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors"
                :class="selected.has(player.id) ? 'border-brand bg-brand text-brand-contrast' : 'border-line-strong'"
              >
                <Check v-if="selected.has(player.id)" class="size-4" />
              </span>
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="mode === 'new'">
        <AppInput
          v-model="newPlayerName"
          label="Player name"
          placeholder="e.g., John Smith"
          @keyup.enter="createPlayer"
        />
        <AppButton :loading="isCreating" :disabled="!newPlayerName.trim()" @click="createPlayer">
          Create and select
        </AppButton>
      </template>

      <template v-else>
        <AppTextarea
          v-model="bulkNames"
          label="Player names"
          :rows="8"
          placeholder="John Smith&#10;Jane Doe&#10;Mike Johnson"
          hint="One name per line. Duplicate names will be skipped."
          :disabled="isBulkCreating"
        />
        <div v-if="bulkResult" class="flex flex-col gap-2 rounded-[14px] bg-surface-2 p-4 text-sm">
          <p v-if="bulkResult.created > 0" class="flex items-center gap-2 font-medium text-win">
            <CheckCircle class="size-4" />
            Created {{ bulkResult.created }} player{{ bulkResult.created !== 1 ? 's' : '' }} and selected them
          </p>
          <div v-if="bulkResult.skipped.length > 0" class="text-warn">
            <p class="flex items-center gap-2 font-medium"><AlertTriangle class="size-4" /> Skipped (already exist):</p>
            <ul class="mt-1 list-disc pl-6">
              <li v-for="name in bulkResult.skipped" :key="name">{{ name }}</li>
            </ul>
          </div>
          <div v-if="bulkResult.errors.length > 0" class="text-loss">
            <p class="flex items-center gap-2 font-medium"><AlertTriangle class="size-4" /> Errors:</p>
            <ul class="mt-1 list-disc pl-6">
              <li v-for="err in bulkResult.errors" :key="err">{{ err }}</li>
            </ul>
          </div>
        </div>
        <AppButton :loading="isBulkCreating" :disabled="bulkNameCount === 0" @click="bulkCreatePlayers">
          Create {{ bulkNameCount || '' }} player{{ bulkNameCount !== 1 ? 's' : '' }}
        </AppButton>
      </template>
    </div>

    <template #footer>
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-2">
          <SegmentedControl
            v-model="membershipType"
            :options="[
              { label: 'Permanent', value: 'PERMANENT' },
              { label: 'Sub', value: 'SUB' }
            ]"
          />
          <template v-if="membershipType === 'SUB'">
            <SegmentedControl
              v-model="skillLevel"
              :options="[
                { label: 'Beginner', value: 'BEGINNER' },
                { label: 'Intermediate', value: 'INTERMEDIATE' },
                { label: 'Advanced', value: 'ADVANCED' }
              ]"
            />
            <p class="text-xs text-ink-faint">Skill level only sets a sub's starting rating.</p>
          </template>
        </div>
        <AppButton block :loading="isSaving" :disabled="selected.size === 0" @click="addSelected">
          Add {{ selected.size || '' }} player{{ selected.size !== 1 ? 's' : '' }}
        </AppButton>
      </div>
    </template>
  </Sheet>
</template>
