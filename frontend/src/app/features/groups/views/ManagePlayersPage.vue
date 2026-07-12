<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Users } from 'lucide-vue-next'
import { groupsApi } from '../services/groups.api'
import { api } from '@/app/core/http/api-client'
import type { GroupDto, GroupPlayerDto, SkillLevel } from '@/app/core/models/dto'
import { useAuthStore } from '@/stores/auth'
import { useGroupContextStore, type GroupRole } from '@/stores/group-context'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import HeaderActions from '@/app/core/layout/HeaderActions.vue'
import IconButton from '@/app/core/ui/components/IconButton.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppBadge from '@/app/core/ui/components/AppBadge.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import PullRefresh from '@/app/core/ui/components/PullRefresh.vue'
import MemberSheet from '../components/MemberSheet.vue'
import AddPlayersSheet from '../components/AddPlayersSheet.vue'

const route = useRoute()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()

const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const members = ref<GroupPlayerDto[]>([])
const isLoading = ref(true)
const error = ref('')
const search = ref('')

const showAddSheet = ref(false)
const showMemberSheet = ref(false)
const selectedMemberId = ref<string | null>(null)

onMounted(() => loadData())

async function loadData(silent = false) {
  if (!silent) isLoading.value = true
  error.value = ''
  try {
    const [groupRes, playersRes] = await Promise.all([
      groupsApi.get(groupId.value),
      groupsApi.getPlayers(groupId.value)
    ])
    group.value = groupRes
    members.value = playersRes.players
    syncGroupContext()
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load data')
  } finally {
    isLoading.value = false
  }
}

function syncGroupContext() {
  if (!group.value) return
  const userId = authStore.userId
  const myPlayer = members.value.find((p) => p.userId && p.userId === userId) || null
  let role: GroupRole = null
  if (userId && group.value.ownerUserId === userId) role = 'OWNER'
  else if (myPlayer) role = myPlayer.role
  groupContext.setGroup({
    groupId: groupId.value,
    groupName: group.value.name,
    myPlayerId: myPlayer?.id ?? null,
    role
  })
}

const filteredMembers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return members.value
  return members.value.filter((p) => p.displayName.toLowerCase().includes(q))
})

const existingPlayerIds = computed(() => members.value.map((p) => p.playerId))

const selectedMember = computed(
  () => members.value.find((p) => p.id === selectedMemberId.value) ?? null
)

const skillLabels: Record<SkillLevel, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced'
}

function openMember(player: GroupPlayerDto) {
  selectedMemberId.value = player.id
  showMemberSheet.value = true
}

async function refresh() {
  api.invalidateCache(`/api/groups/${groupId.value}/players`)
  api.invalidateCache('/api/players')
  await loadData(true)
}
</script>

<template>
  <HeaderActions>
    <IconButton label="Add players" variant="brand" @click="showAddSheet = true">
      <Plus class="size-5" />
    </IconButton>
  </HeaderActions>

  <PullRefresh :on-refresh="refresh">
    <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5">
      <SkeletonList v-if="isLoading" :rows="6" avatar />

      <ErrorState v-else-if="error" :message="error" @retry="loadData()" />

      <div v-else class="flex flex-col gap-4">
        <AppInput
          v-model="search"
          type="search"
          inputmode="search"
          placeholder="Search players..."
        />

        <AppEmptyState
          v-if="members.length === 0"
          title="No players yet"
          description="Add players to this group to start creating events."
        >
          <template #icon><Users class="size-7" /></template>
          <template #action>
            <AppButton @click="showAddSheet = true">
              <Plus class="size-4" />
              Add players
            </AppButton>
          </template>
        </AppEmptyState>

        <AppEmptyState
          v-else-if="filteredMembers.length === 0"
          title="No players found"
          description="Try a different search term."
        />

        <section v-else class="overflow-hidden rounded-[14px] border border-line bg-surface-1">
          <div class="divide-y divide-line">
            <button
              v-for="player in filteredMembers"
              :key="player.id"
              type="button"
              class="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
              @click="openMember(player)"
            >
              <Avatar :name="player.displayName" :seed="player.playerId" size="md" />
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-medium text-ink">{{ player.displayName }}</span>
                  <AppBadge v-if="player.role === 'ORGANIZER'" variant="brand">Organizer</AppBadge>
                </span>
                <span v-if="player.membershipType === 'SUB'" class="flex items-center gap-1.5">
                  <AppBadge variant="warning">Sub</AppBadge>
                  <AppBadge variant="muted">{{ skillLabels[player.skillLevel ?? 'INTERMEDIATE'] }}</AppBadge>
                </span>
              </span>
              <span class="flex shrink-0 flex-col items-end">
                <span class="font-mono text-sm font-semibold tabular-nums text-ink">
                  {{ player.rating.toFixed(1) }}
                </span>
                <span class="font-mono text-xs tabular-nums text-ink-faint">{{ player.gamesPlayed }} GP</span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </div>
  </PullRefresh>

  <MemberSheet
    v-model="showMemberSheet"
    :group-id="groupId"
    :player="selectedMember"
    @updated="loadData(true)"
  />

  <AddPlayersSheet
    v-model="showAddSheet"
    :group-id="groupId"
    :existing-player-ids="existingPlayerIds"
    @added="loadData(true)"
  />
</template>
