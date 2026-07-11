<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Settings, Users, Plus, CalendarDays, Upload, DollarSign, UserPlus } from 'lucide-vue-next'
import { groupsApi } from '../services/groups.api'
import { eventsApi } from '@/app/features/events/services/events.api'
import { api } from '@/app/core/http/api-client'
import type { GroupDto, GroupPlayerDto, EventListItemDto } from '@/app/core/models/dto'
import { useAuthStore } from '@/stores/auth'
import { useGroupContextStore, type GroupRole } from '@/stores/group-context'
import { useToast } from '@/app/core/ui/composables/useToast'
import { useConfirm } from '@/app/core/ui/composables/useConfirm'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import HeaderActions from '@/app/core/layout/HeaderActions.vue'
import IconButton from '@/app/core/ui/components/IconButton.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import SegmentedControl from '@/app/core/ui/components/SegmentedControl.vue'
import ListItem from '@/app/core/ui/components/ListItem.vue'
import Fab from '@/app/core/ui/components/Fab.vue'
import PullRefresh from '@/app/core/ui/components/PullRefresh.vue'
import GroupStatsRow from '../components/GroupStatsRow.vue'
import EventCard from '../components/EventCard.vue'
import ImportHistorySheet from '../components/ImportHistorySheet.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()
const toast = useToast()
const { confirm } = useConfirm()

const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const players = ref<GroupPlayerDto[]>([])
const events = ref<EventListItemDto[]>([])
const isLoading = ref(true)
const error = ref('')
const statusFilter = ref('all')
const showImportSheet = ref(false)

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Done', value: 'done' }
]

onMounted(loadAll)

async function loadAll(silent = false) {
  if (!silent) isLoading.value = true
  error.value = ''
  try {
    // Events failing shouldn't take down the whole page (ported behavior)
    const [groupRes, playersRes, eventsRes] = await Promise.all([
      groupsApi.get(groupId.value),
      groupsApi.getPlayers(groupId.value),
      eventsApi.list(groupId.value).catch((e) => {
        console.error('Failed to load events:', e)
        return { events: [] as EventListItemDto[] }
      })
    ])
    group.value = groupRes
    players.value = playersRes.players
    events.value = eventsRes.events
    syncGroupContext()
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load group')
  } finally {
    isLoading.value = false
  }
}

function syncGroupContext() {
  if (!group.value) return
  const userId = authStore.userId
  const myPlayer = players.value.find((p) => p.userId && p.userId === userId) || null
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

const canManage = computed(() => groupContext.canManage)

const permanentPlayers = computed(() => players.value.filter((p) => p.membershipType === 'PERMANENT'))

const ratingSystemLabel = computed(() => {
  switch (group.value?.settings.ratingSystem) {
    case 'CATCH_UP': return 'Catch-Up Mode'
    case 'RACS_ELO': return "Rac's ELO"
    default: return 'Serious ELO'
  }
})

const filteredEvents = computed(() => {
  if (statusFilter.value === 'active') return events.value.filter((e) => e.status !== 'COMPLETED')
  if (statusFilter.value === 'done') return events.value.filter((e) => e.status === 'COMPLETED')
  return events.value
})

const trackPayments = computed(() => !!group.value?.settings.paymentSettings?.trackPayments)

async function reloadEvents() {
  try {
    events.value = (await eventsApi.list(groupId.value)).events
  } catch (e) {
    console.error('Failed to load events:', e)
  }
}

async function deleteEvent(event: EventListItemDto) {
  const ok = await confirm({
    title: 'Delete event?',
    message: `Delete event "${event.name || 'Unnamed event'}"? This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return
  try {
    await eventsApi.delete(event.id)
    toast.success('Event deleted')
    await reloadEvents()
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to delete event'))
  }
}

async function refresh() {
  api.invalidateCache(`/api/groups/${groupId.value}`)
  api.invalidateCache(`/api/groups/${groupId.value}/players`)
  api.invalidateCache(`/api/groups/${groupId.value}/rankings`)
  await loadAll(true)
}
</script>

<template>
  <HeaderActions>
    <template v-if="canManage">
      <IconButton label="Manage players" @click="router.push(`/groups/${groupId}/players/manage`)">
        <Users class="size-5" />
      </IconButton>
      <IconButton label="Group settings" @click="router.push(`/groups/${groupId}/settings`)">
        <Settings class="size-5" />
      </IconButton>
    </template>
  </HeaderActions>

  <PullRefresh :on-refresh="refresh">
    <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5">
      <SkeletonList v-if="isLoading || !authStore.isInitialized" :rows="5" />

      <ErrorState v-else-if="error" :message="error" @retry="loadAll()" />

      <div v-else-if="group" class="flex flex-col gap-5">
        <section class="flex flex-col gap-2">
          <GroupStatsRow :players="players" :events="events" />
          <p class="text-xs text-ink-faint">{{ ratingSystemLabel }}</p>
        </section>

        <AppEmptyState
          v-if="canManage && permanentPlayers.length === 0"
          title="No permanent players yet"
          description="Add permanent players to your group to start creating events."
        >
          <template #icon><UserPlus class="size-7" /></template>
          <template #action>
            <AppButton @click="router.push(`/groups/${groupId}/players/manage`)">
              Manage players
            </AppButton>
          </template>
        </AppEmptyState>

        <section class="flex flex-col gap-3">
          <SegmentedControl v-model="statusFilter" :options="statusOptions" />

          <AppEmptyState
            v-if="filteredEvents.length === 0"
            :title="statusFilter === 'all' ? 'No events yet' : 'No events here'"
            :description="
              statusFilter === 'done'
                ? 'Completed events will show up here.'
                : 'Create a new event to start organizing games.'
            "
          >
            <template #icon><CalendarDays class="size-7" /></template>
            <template v-if="canManage && statusFilter !== 'done'" #action>
              <AppButton @click="router.push(`/groups/${groupId}/events/new`)">
                <Plus class="size-4" />
                Create event
              </AppButton>
            </template>
          </AppEmptyState>

          <div v-else class="flex flex-col gap-2">
            <EventCard
              v-for="event in filteredEvents"
              :key="event.id"
              :event="event"
              :deletable="canManage && event.status !== 'COMPLETED'"
              @click="router.push(`/events/${event.id}`)"
              @delete="deleteEvent(event)"
            />
          </div>
        </section>

        <!-- Organizer tools without another home: history import, payments -->
        <section v-if="canManage" class="overflow-hidden rounded-xl border border-line bg-surface-1">
          <div class="divide-y divide-line">
            <ListItem title="Import history" subtitle="Load past games from a CSV" @click="showImportSheet = true">
              <template #leading><Upload class="size-5" /></template>
            </ListItem>
            <ListItem
              v-if="trackPayments"
              title="Payments"
              subtitle="Track sub fees and attendance"
              chevron
              @click="router.push(`/groups/${groupId}/payments`)"
            >
              <template #leading><DollarSign class="size-5" /></template>
            </ListItem>
          </div>
        </section>
      </div>
    </div>
  </PullRefresh>

  <Fab v-if="canManage" label="New event" @click="router.push(`/groups/${groupId}/events/new`)">
    <Plus class="size-5" />
  </Fab>

  <ImportHistorySheet v-model="showImportSheet" :group-id="groupId" @imported="reloadEvents" />
</template>
