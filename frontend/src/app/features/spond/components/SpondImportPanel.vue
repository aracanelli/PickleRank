<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { CalendarClock, Users, ChevronRight, RefreshCw } from 'lucide-vue-next'
import { spondApi } from '../services/spond.api'
import SpondLinkSheet from './SpondLinkSheet.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppSelect from '@/app/core/ui/components/AppSelect.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import { useToast } from '@/app/core/ui/composables/useToast'
import type {
  GroupPlayerDto,
  SpondEventDto,
  SpondResolvedAttendeeDto,
  SpondAttendeeLinkInput
} from '@/app/core/models/dto'

const props = defineProps<{
  groupId: string
  players: GroupPlayerDto[]
}>()

// Emits the resulting group_player IDs to pre-select in the participant picker.
const emit = defineEmits<{ populate: [ids: string[]] }>()

const toast = useToast()

type Phase = 'loading' | 'not-connected' | 'need-group' | 'events'
const phase = ref<Phase>('loading')
const error = ref('')

const spondGroups = ref<{ label: string; value: string }[]>([])
const selectedSpondGroup = ref('')
const spondGroupName = ref<string | null>(null)

const events = ref<SpondEventDto[]>([])
const selectedEventId = ref<string | null>(null)
const isResolving = ref(false)

// Link sheet state
const showLinkSheet = ref(false)
const unmatchedAttendees = ref<SpondResolvedAttendeeDto[]>([])
const pendingMatchedIds = ref<string[]>([])
const pendingEventId = ref<string | null>(null)

onMounted(init)

async function init() {
  phase.value = 'loading'
  error.value = ''
  try {
    const status = await spondApi.status()
    if (!status.connected) {
      phase.value = 'not-connected'
      return
    }
    const link = await spondApi.getGroupLink(props.groupId)
    if (!link.linked) {
      await loadSpondGroups()
      phase.value = 'need-group'
      return
    }
    spondGroupName.value = link.spondGroupName ?? null
    await loadEvents()
    phase.value = 'events'
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load Spond')
  }
}

async function loadSpondGroups() {
  const res = await spondApi.listGroups()
  spondGroups.value = res.groups.map((g) => ({
    label: `${g.name} (${g.memberCount})`,
    value: g.spondGroupId
  }))
}

async function saveGroupLink() {
  if (!selectedSpondGroup.value) return
  error.value = ''
  try {
    const link = await spondApi.setGroupLink(props.groupId, selectedSpondGroup.value)
    spondGroupName.value = link.spondGroupName ?? null
    await loadEvents()
    phase.value = 'events'
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Could not link Spond group')
  }
}

async function loadEvents() {
  const res = await spondApi.listEvents(props.groupId)
  events.value = res.events
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

async function selectEvent(ev: SpondEventDto) {
  if (isResolving.value) return
  selectedEventId.value = ev.spondEventId
  isResolving.value = true
  error.value = ''
  try {
    const res = await spondApi.resolveEvent(props.groupId, ev.spondEventId)
    const unmatched = res.attendees.filter((a) => !a.matchedGroupPlayerId)
    if (unmatched.length === 0) {
      emit('populate', res.matchedGroupPlayerIds)
      toast.success(`Imported ${res.matchedGroupPlayerIds.length} players from Spond`)
    } else {
      // Defer emit until the organizer resolves the unknown attendees.
      pendingMatchedIds.value = res.matchedGroupPlayerIds
      pendingEventId.value = ev.spondEventId
      unmatchedAttendees.value = unmatched
      showLinkSheet.value = true
    }
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Could not read the Spond event')
  } finally {
    isResolving.value = false
  }
}

async function onConfirmLinks(links: SpondAttendeeLinkInput[]) {
  if (!pendingEventId.value) return
  try {
    const res = await spondApi.confirmLinks(props.groupId, pendingEventId.value, links)
    const finalIds = [...pendingMatchedIds.value, ...res.groupPlayerIds]
    showLinkSheet.value = false
    emit('populate', finalIds)
    toast.success(`Imported ${finalIds.length} players from Spond`)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Could not link attendees'))
  }
}

const hasEvents = computed(() => events.value.length > 0)
</script>

<template>
  <div class="flex flex-col gap-3">
    <SkeletonList
      v-if="phase === 'loading'"
      :rows="4"
    />

    <ErrorState
      v-else-if="error && phase !== 'events'"
      :message="error"
      @retry="init"
    />

    <!-- Not connected -->
    <AppEmptyState
      v-else-if="phase === 'not-connected'"
      title="Spond isn't connected"
      description="Connect your Spond account from the account menu (top right) to import event attendees."
    >
      <template #icon>
        <CalendarClock class="size-7" />
      </template>
    </AppEmptyState>

    <!-- Needs group mapping -->
    <div
      v-else-if="phase === 'need-group'"
      class="flex flex-col gap-3"
    >
      <p class="text-sm text-ink-muted">
        Which Spond group is this? We'll remember it and show its upcoming events here.
      </p>
      <AppSelect
        v-model="selectedSpondGroup"
        :options="spondGroups"
        placeholder="Select a Spond group"
        label="Spond group"
      />
      <AppButton
        :disabled="!selectedSpondGroup"
        @click="saveGroupLink"
      >
        Link group
      </AppButton>
      <p
        v-if="error"
        class="text-sm text-loss"
      >
        {{ error }}
      </p>
    </div>

    <!-- Event list -->
    <div
      v-else
      class="flex flex-col gap-3"
    >
      <div class="flex items-center justify-between">
        <p class="text-sm text-ink-muted">
          <span
            v-if="spondGroupName"
            class="font-medium text-ink"
          >{{ spondGroupName }}</span>
          <span v-else>Upcoming events</span>
        </p>
        <button
          type="button"
          class="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          @click="loadEvents"
        >
          <RefreshCw class="size-3.5" /> Refresh
        </button>
      </div>

      <AppEmptyState
        v-if="!hasEvents"
        title="No upcoming events"
        description="There are no upcoming events in this Spond group."
      >
        <template #icon>
          <CalendarClock class="size-7" />
        </template>
      </AppEmptyState>

      <div
        v-else
        class="flex flex-col gap-1.5"
      >
        <button
          v-for="ev in events"
          :key="ev.spondEventId"
          type="button"
          class="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-surface-1 px-3 py-2 text-left transition-colors"
          :class="[
            selectedEventId === ev.spondEventId
              ? 'border-brand ring-2 ring-brand/40'
              : 'border-line hover:bg-surface-2',
            isResolving ? 'opacity-60' : ''
          ]"
          :disabled="isResolving"
          @click="selectEvent(ev)"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-ink">
              {{ ev.name }}
            </p>
            <p class="truncate text-xs text-ink-faint">
              {{ formatDate(ev.startsAt) }}
            </p>
          </div>
          <span class="inline-flex items-center gap-1 shrink-0 text-xs text-ink-muted">
            <Users class="size-3.5" />{{ ev.acceptedCount }}
          </span>
          <ChevronRight class="size-4 shrink-0 text-ink-faint" />
        </button>
      </div>

      <p
        v-if="error"
        class="text-sm text-loss"
      >
        {{ error }}
      </p>
    </div>

    <SpondLinkSheet
      v-model="showLinkSheet"
      :attendees="unmatchedAttendees"
      :players="players"
      @confirm="onConfirmLinks"
    />
  </div>
</template>
