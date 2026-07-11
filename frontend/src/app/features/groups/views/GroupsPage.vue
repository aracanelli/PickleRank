<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ClipboardList,
  Users,
  Plus,
  ChevronRight,
  EllipsisVertical,
  Pencil,
  Copy,
  RefreshCw,
  Archive
} from 'lucide-vue-next'
import { groupsApi } from '../services/groups.api'
import { api } from '@/app/core/http/api-client'
import type { GroupListItemDto } from '@/app/core/models/dto'
import { useGroupContextStore } from '@/stores/group-context'
import { useToast } from '@/app/core/ui/composables/useToast'
import { useConfirm } from '@/app/core/ui/composables/useConfirm'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import IconButton from '@/app/core/ui/components/IconButton.vue'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import Fab from '@/app/core/ui/components/Fab.vue'
import PullRefresh from '@/app/core/ui/components/PullRefresh.vue'
import CreateGroupSheet from '../components/CreateGroupSheet.vue'

const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()
const groupContext = useGroupContextStore()

const groups = ref<GroupListItemDto[]>([])
const memberGroups = ref<GroupListItemDto[]>([])
const isLoading = ref(true)
const error = ref('')
const showCreateSheet = ref(false)

// Per-group actions sheet
const showActionsSheet = ref(false)
const actionsGroup = ref<GroupListItemDto | null>(null)
const renameMode = ref(false)
const renameName = ref('')
const isRenaming = ref(false)
const isDuplicating = ref(false)
const isRecalculating = ref(false)
const isArchiving = ref(false)

onMounted(async () => {
  // Leaving group scope: reset contextual header/tabs
  groupContext.clear()
  await loadGroups()
})

async function loadGroups(silent = false) {
  if (!silent) isLoading.value = true
  error.value = ''
  try {
    const [ownedResponse, memberResponse] = await Promise.all([
      groupsApi.list(),
      groupsApi.listMemberGroups()
    ])
    groups.value = ownedResponse.groups
    // Groups I organize are excluded from the "member of" section
    const ownedIds = new Set(ownedResponse.groups.map((g) => g.id))
    memberGroups.value = memberResponse.groups.filter((g) => !ownedIds.has(g.id))
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load groups')
  } finally {
    isLoading.value = false
  }
}

async function refresh() {
  api.invalidateCache('/api/groups')
  await loadGroups(true)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function openActions(group: GroupListItemDto) {
  actionsGroup.value = group
  renameMode.value = false
  renameName.value = group.name
  showActionsSheet.value = true
}

const actionBusy = () =>
  isRenaming.value || isDuplicating.value || isRecalculating.value || isArchiving.value

async function renameGroup() {
  const group = actionsGroup.value
  if (!group || !renameName.value.trim() || isRenaming.value) return
  isRenaming.value = true
  try {
    const updated = await groupsApi.rename(group.id, renameName.value.trim())
    group.name = updated.name
    toast.success('Group renamed')
    showActionsSheet.value = false
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to rename group'))
  } finally {
    isRenaming.value = false
  }
}

async function duplicateGroup() {
  const group = actionsGroup.value
  if (!group || actionBusy()) return
  isDuplicating.value = true
  try {
    const newGroup = await groupsApi.duplicate(group.id)
    toast.success(`Created "${newGroup.name}"`)
    showActionsSheet.value = false
    router.push(`/groups/${newGroup.id}`)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to duplicate group'))
  } finally {
    isDuplicating.value = false
  }
}

async function recalculateRatings() {
  const group = actionsGroup.value
  if (!group || actionBusy()) return
  const ok = await confirm({
    title: 'Recalculate ratings?',
    message:
      'This resets all player ratings and replays every completed event from the beginning. Current ratings will be replaced.',
    confirmLabel: 'Recalculate'
  })
  if (!ok) return
  isRecalculating.value = true
  try {
    const result = await groupsApi.recalculateRatings(group.id)
    toast.success(
      `Recalculated: ${result.eventsRecalculated} events processed, ${result.playersUpdated} players updated`
    )
    showActionsSheet.value = false
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to recalculate ratings'))
  } finally {
    isRecalculating.value = false
  }
}

async function archiveGroup() {
  const group = actionsGroup.value
  if (!group || actionBusy()) return
  const ok = await confirm({
    title: 'Archive group?',
    message: `"${group.name}" will be hidden from your dashboard.`,
    confirmLabel: 'Archive',
    danger: true
  })
  if (!ok) return
  isArchiving.value = true
  try {
    await groupsApi.archive(group.id)
    toast.success('Group archived')
    showActionsSheet.value = false
    await loadGroups(true)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to archive group'))
  } finally {
    isArchiving.value = false
  }
}
</script>

<template>
  <PullRefresh :on-refresh="refresh">
    <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5">
      <SkeletonList v-if="isLoading" :rows="4" />

      <ErrorState v-else-if="error" :message="error" @retry="loadGroups()" />

      <AppEmptyState
        v-else-if="groups.length === 0 && memberGroups.length === 0"
        title="No groups yet"
        description="Create your first group to start organizing pickleball events and tracking rankings."
      >
        <template #icon><ClipboardList class="size-7" /></template>
        <template #action>
          <AppButton @click="showCreateSheet = true">
            <Plus class="size-4" />
            Create your first group
          </AppButton>
        </template>
      </AppEmptyState>

      <div v-else class="flex flex-col gap-6">
        <section v-if="groups.length > 0" class="flex flex-col gap-3">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-ink-faint">My groups</h2>
          <div class="grid gap-3 md:grid-cols-2">
            <div
              v-for="group in groups"
              :key="group.id"
              class="flex items-center rounded-xl border border-line bg-surface-1 transition-colors hover:bg-surface-2"
            >
              <button
                type="button"
                class="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
                @click="router.push(`/groups/${group.id}`)"
              >
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="truncate text-sm font-semibold text-ink">{{ group.name }}</span>
                  <span class="truncate text-sm text-ink-faint">
                    <span class="font-mono tabular-nums">{{ group.playerCount }}</span>
                    players · {{ formatDate(group.createdAt) }}
                  </span>
                </span>
                <ChevronRight class="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              </button>
              <div class="pr-2">
                <IconButton label="Group actions" @click="openActions(group)">
                  <EllipsisVertical class="size-5" />
                </IconButton>
              </div>
            </div>
          </div>
        </section>

        <section v-if="memberGroups.length > 0" class="flex flex-col gap-3">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-ink-faint">Member of</h2>
          <div class="grid gap-3 md:grid-cols-2">
            <button
              v-for="group in memberGroups"
              :key="group.id"
              type="button"
              class="flex min-h-16 min-w-0 items-center gap-3 rounded-xl border border-line bg-surface-1 px-4 py-3 text-left transition-colors hover:bg-surface-2"
              @click="router.push(`/groups/${group.id}`)"
            >
              <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Users class="size-4" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="truncate text-sm font-semibold text-ink">{{ group.name }}</span>
                <span class="truncate text-sm text-ink-faint">
                  <span class="font-mono tabular-nums">{{ group.playerCount }}</span>
                  players · {{ formatDate(group.createdAt) }}
                </span>
              </span>
              <ChevronRight class="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </div>
  </PullRefresh>

  <Fab label="New group" @click="showCreateSheet = true">
    <Plus class="size-5" />
  </Fab>

  <CreateGroupSheet v-model="showCreateSheet" />

  <!-- Per-group actions -->
  <Sheet
    v-model="showActionsSheet"
    :title="actionsGroup?.name"
    :persistent="actionBusy()"
    @closed="renameMode = false"
  >
    <form v-if="renameMode" class="flex flex-col gap-3" @submit.prevent="renameGroup">
      <AppInput v-model="renameName" label="Group name" placeholder="Group name" required />
      <div class="flex gap-2">
        <AppButton variant="secondary" block :disabled="isRenaming" @click="renameMode = false">
          Cancel
        </AppButton>
        <AppButton block type="submit" :loading="isRenaming" :disabled="!renameName.trim()">
          Save
        </AppButton>
      </div>
    </form>

    <div v-else class="flex flex-col">
      <button
        type="button"
        class="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        @click="renameMode = true"
      >
        <Pencil class="size-5 text-ink-muted" />
        Rename
      </button>
      <button
        type="button"
        class="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
        :disabled="isDuplicating"
        @click="duplicateGroup"
      >
        <Copy class="size-5 text-ink-muted" />
        {{ isDuplicating ? 'Duplicating…' : 'Duplicate' }}
      </button>
      <button
        type="button"
        class="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
        :disabled="isRecalculating"
        @click="recalculateRatings"
      >
        <RefreshCw class="size-5 text-ink-muted" :class="isRecalculating ? 'animate-spin' : ''" />
        {{ isRecalculating ? 'Recalculating…' : 'Recalculate ratings' }}
      </button>
      <button
        type="button"
        class="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-loss transition-colors hover:bg-loss/10 disabled:opacity-50"
        :disabled="isArchiving"
        @click="archiveGroup"
      >
        <Archive class="size-5" />
        {{ isArchiving ? 'Archiving…' : 'Archive' }}
      </button>
    </div>
  </Sheet>
</template>
