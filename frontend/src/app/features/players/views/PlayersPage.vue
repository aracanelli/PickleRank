<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Plus, Users, Search, ListPlus } from 'lucide-vue-next'
import { playersApi } from '../services/players.api'
import { api } from '@/app/core/http/api-client'
import type { PlayerDto } from '@/app/core/models/dto'
import { useToast } from '@/app/core/ui/composables/useToast'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import HeaderActions from '@/app/core/layout/HeaderActions.vue'
import IconButton from '@/app/core/ui/components/IconButton.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppTextarea from '@/app/core/ui/components/AppTextarea.vue'
import AppBadge from '@/app/core/ui/components/AppBadge.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import Fab from '@/app/core/ui/components/Fab.vue'
import PullRefresh from '@/app/core/ui/components/PullRefresh.vue'
import PlayerSheet from '../components/PlayerSheet.vue'
import BulkCreateSheet from '../components/BulkCreateSheet.vue'

const toast = useToast()

const players = ref<PlayerDto[]>([])
const isLoading = ref(true)
const error = ref('')
const searchQuery = ref('')

const showPlayerSheet = ref(false)
const selectedPlayerId = ref<string | null>(null)
const showBulkSheet = ref(false)

// Create sheet
const showCreateSheet = ref(false)
const newPlayerName = ref('')
const newPlayerNotes = ref('')
const isCreating = ref(false)

onMounted(() => loadPlayers())

async function loadPlayers(silent = false) {
  if (!silent) isLoading.value = true
  error.value = ''
  try {
    const response = await playersApi.list(searchQuery.value.trim() || undefined)
    players.value = response.players
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load players')
  } finally {
    isLoading.value = false
  }
}

// Debounced server-side search (ported: 300ms)
let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => loadPlayers(true), 300)
})
onUnmounted(() => clearTimeout(searchTimeout))

const selectedPlayer = computed(
  () => players.value.find((p) => p.id === selectedPlayerId.value) ?? null
)

function openPlayer(player: PlayerDto) {
  selectedPlayerId.value = player.id
  showPlayerSheet.value = true
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

async function createPlayer() {
  if (!newPlayerName.value.trim()) return
  isCreating.value = true
  try {
    await playersApi.create({
      displayName: newPlayerName.value.trim(),
      notes: newPlayerNotes.value.trim() || undefined
    })
    toast.success('Player created')
    showCreateSheet.value = false
    newPlayerName.value = ''
    newPlayerNotes.value = ''
    await loadPlayers(true)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to create player'))
  } finally {
    isCreating.value = false
  }
}

async function refresh() {
  api.invalidateCache('/api/players')
  await loadPlayers(true)
}
</script>

<template>
  <HeaderActions>
    <IconButton label="Bulk add players" @click="showBulkSheet = true">
      <ListPlus class="size-5" />
    </IconButton>
  </HeaderActions>

  <PullRefresh :on-refresh="refresh">
    <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5">
      <div class="flex flex-col gap-4">
        <AppInput v-model="searchQuery" type="search" inputmode="search" placeholder="Search players...">
          <template #leading><Search class="size-4" /></template>
        </AppInput>

        <SkeletonList v-if="isLoading" :rows="6" avatar />

        <ErrorState v-else-if="error" :message="error" @retry="loadPlayers()" />

        <AppEmptyState
          v-else-if="players.length === 0 && !searchQuery"
          title="No players yet"
          description="Create players here and add them to your groups."
        >
          <template #icon><Users class="size-7" /></template>
          <template #action>
            <div class="flex flex-wrap justify-center gap-2">
              <AppButton variant="secondary" @click="showBulkSheet = true">Bulk add players</AppButton>
              <AppButton @click="showCreateSheet = true">Create your first player</AppButton>
            </div>
          </template>
        </AppEmptyState>

        <AppEmptyState
          v-else-if="players.length === 0"
          title="No players found"
          description="Try a different search term."
        >
          <template #icon><Search class="size-7" /></template>
        </AppEmptyState>

        <section v-else class="overflow-hidden rounded-[14px] border border-line bg-surface-1">
          <div class="divide-y divide-line">
            <button
              v-for="player in players"
              :key="player.id"
              type="button"
              class="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
              @click="openPlayer(player)"
            >
              <Avatar :name="player.displayName" :seed="player.id" size="md" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm font-medium text-ink">{{ player.displayName }}</span>
                <span class="truncate text-sm text-ink-faint">
                  {{ player.notes || `Added ${formatDate(player.createdAt)}` }}
                </span>
              </span>
              <AppBadge v-if="player.userId" variant="success">Linked</AppBadge>
            </button>
          </div>
        </section>
      </div>
    </div>
  </PullRefresh>

  <Fab label="New player" @click="showCreateSheet = true">
    <Plus class="size-5" />
  </Fab>

  <PlayerSheet v-model="showPlayerSheet" :player="selectedPlayer" @updated="loadPlayers(true)" />

  <BulkCreateSheet v-model="showBulkSheet" @created="loadPlayers(true)" />

  <Sheet v-model="showCreateSheet" title="New player" :persistent="isCreating">
    <div class="flex flex-col gap-4">
      <AppInput
        v-model="newPlayerName"
        label="Name"
        placeholder="e.g., John Smith"
        @keyup.enter="createPlayer"
      />
      <AppTextarea
        v-model="newPlayerNotes"
        label="Notes (optional)"
        :rows="2"
        placeholder="e.g., Left-handed, prefers kitchen play"
      />
    </div>
    <template #footer>
      <div class="flex gap-2">
        <AppButton variant="secondary" block :disabled="isCreating" @click="showCreateSheet = false">
          Cancel
        </AppButton>
        <AppButton block :loading="isCreating" :disabled="!newPlayerName.trim()" @click="createPlayer">
          Create player
        </AppButton>
      </div>
    </template>
  </Sheet>
</template>
