<script setup lang="ts">
import { ref, onMounted, computed, watch, useId } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Users } from 'lucide-vue-next'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { eventsApi } from '../services/events.api'
import type { GroupDto, GroupPlayerDto } from '@/app/core/models/dto'
import { useAuthStore } from '@/stores/auth'
import { useGroupContextStore, type GroupRole } from '@/stores/group-context'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import { useToast } from '@/app/core/ui/composables/useToast'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import Stepper from '@/app/core/ui/components/Stepper.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import ParticipantPicker from '../components/ParticipantPicker.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()
const toast = useToast()
const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const players = ref<GroupPlayerDto[]>([])
const selectedPlayerIds = ref<string[]>([])
const isLoading = ref(true)
const isCreating = ref(false)
const error = ref('')

// Form
const eventName = ref('')
const startsAtLocal = ref('')
const courts = ref(2)
const rounds = ref(4)

// Mobile 2-step wizard (both sections are visible on md+)
const step = ref<1 | 2>(1)
const startsAtId = useId()

const namePlaceholder = `e.g. ${new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric'
})} session`

const requiredPlayers = computed(() => courts.value * 4)
const canCreate = computed(() => selectedPlayerIds.value.length === requiredPlayers.value)

const permanentPlayers = computed(() => players.value.filter((p) => p.membershipType === 'PERMANENT'))

const createDisabledReason = computed(() => {
  const diff = requiredPlayers.value - selectedPlayerIds.value.length
  if (diff > 0) return `Select ${diff} more player${diff === 1 ? '' : 's'} to continue`
  if (diff < 0) return `Remove ${-diff} player${diff === -1 ? '' : 's'} to continue`
  return ''
})

onMounted(async () => {
  await Promise.all([loadPlayers(), loadGroup()])
})

// Ported: auto-select all permanent players and derive the default court
// count (ceil(permanent / 4)) whenever players load.
watch(
  players,
  (newPlayers) => {
    if (newPlayers.length > 0) {
      selectedPlayerIds.value = permanentPlayers.value.map((p) => p.id)
      const permanentCount = permanentPlayers.value.length
      if (permanentCount > 0) {
        courts.value = Math.min(10, Math.max(1, Math.ceil(permanentCount / 4)))
      }
    }
  },
  { immediate: true }
)

async function loadPlayers() {
  isLoading.value = true
  error.value = ''
  try {
    const response = await groupsApi.getPlayers(groupId.value)
    players.value = response.players
    syncGroupContext()
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load players')
  } finally {
    isLoading.value = false
  }
}

async function loadGroup() {
  try {
    group.value = await groupsApi.get(groupId.value)
    // Ported: group settings drive the default round count
    if (group.value.settings?.defaultRounds) {
      rounds.value = group.value.settings.defaultRounds
    }
    syncGroupContext()
  } catch (e) {
    console.error('Failed to load group settings', e)
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

async function createEvent() {
  if (!canCreate.value || isCreating.value) return
  isCreating.value = true
  try {
    const event = await eventsApi.create(groupId.value, {
      name: eventName.value.trim() || undefined,
      startsAt: startsAtLocal.value ? new Date(startsAtLocal.value).toISOString() : undefined,
      courts: courts.value,
      rounds: rounds.value,
      participantIds: [...selectedPlayerIds.value]
    })
    router.push(`/events/${event.id}`)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to create event'))
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-5 md:px-6">
    <SkeletonList v-if="isLoading" :rows="5" />

    <ErrorState v-else-if="error" :message="error" @retry="loadPlayers()" />

    <div v-else class="flex flex-col gap-5">
      <!-- Masthead -->
      <header>
        <p class="eyebrow text-ink-faint">{{ group?.name || 'Event setup' }}</p>
        <h1 class="display-wide mt-1 text-3xl text-ink">New Event</h1>
        <div class="kitchen-line mt-3" />
      </header>

      <!-- Step indicator dots (mobile only) -->
      <div class="flex items-center justify-center gap-2 md:hidden" role="tablist" aria-label="Steps">
        <button
          v-for="s in [1, 2] as const"
          :key="s"
          type="button"
          class="size-2.5 rounded-full transition-colors"
          :class="step === s ? 'bg-accent-fill' : 'bg-line-strong'"
          :aria-label="s === 1 ? 'Step 1: Setup' : 'Step 2: Players'"
          :aria-current="step === s"
          @click="step = s"
        />
      </div>

      <div class="md:grid md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:items-start md:gap-6">
        <!-- Step 1: Setup -->
        <section
          class="flex-col gap-4 rounded-[14px] border border-line bg-surface-1 p-4 md:p-5"
          :class="step === 1 ? 'flex' : 'hidden md:flex'"
        >
          <h2 class="eyebrow text-ink-faint">Step 1 — Setup</h2>

          <AppInput
            v-model="eventName"
            label="Event name"
            :placeholder="namePlaceholder"
            hint="Optional — leave blank for an unnamed event"
          />

          <div class="flex flex-col gap-1.5">
            <label :for="startsAtId" class="text-sm font-medium text-ink">Starts at</label>
            <input
              :id="startsAtId"
              v-model="startsAtLocal"
              type="datetime-local"
              class="min-h-11 w-full rounded-[10px] border border-line bg-surface-2 px-3.5 text-base text-ink transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
            <p class="text-sm text-ink-faint">Optional</p>
          </div>

          <div class="flex items-start justify-around gap-4 py-1">
            <Stepper v-model="courts" label="Courts" :min="1" :max="10" />
            <Stepper v-model="rounds" label="Rounds" :min="1" :max="20" />
          </div>

          <!-- Participant counter: volt at exact count -->
          <div class="flex flex-col items-center gap-1 rounded-[14px] bg-surface-2 px-4 py-3">
            <div class="flex h-10 items-baseline gap-1.5">
              <span
                class="numeral text-4xl leading-10 transition-colors"
                :class="canCreate ? 'text-accent-text' : 'text-ink'"
              >
                {{ selectedPlayerIds.length }}
              </span>
              <span class="numeral text-xl text-ink-faint">/ {{ requiredPlayers }}</span>
            </div>
            <p class="eyebrow text-ink-faint">Players selected</p>
            <p class="font-mono text-xs tabular-nums text-ink-faint">
              {{ courts }} {{ courts === 1 ? 'COURT' : 'COURTS' }} × 4
            </p>
          </div>
        </section>

        <!-- Step 2: Players -->
        <section
          class="mt-5 flex-col gap-3 md:mt-0"
          :class="step === 2 ? 'flex' : 'hidden md:flex'"
        >
          <h2 class="eyebrow text-ink-faint md:px-1">Step 2 — Players</h2>

          <AppEmptyState
            v-if="players.length === 0"
            title="No players in this group yet"
            description="Add players to the group before creating an event."
          >
            <template #icon><Users class="size-7" /></template>
            <template #action>
              <AppButton @click="router.push(`/groups/${groupId}/players/manage`)">
                Manage players
              </AppButton>
            </template>
          </AppEmptyState>

          <ParticipantPicker
            v-else
            v-model="selectedPlayerIds"
            :players="players"
            :max="requiredPlayers"
          />
        </section>
      </div>

      <!-- Mobile step navigation -->
      <div class="flex flex-col gap-2 border-t border-line pt-4 md:hidden">
        <AppButton v-if="step === 1" block @click="step = 2">
          Next: pick players
        </AppButton>
        <template v-else>
          <AppButton
            variant="broadcast"
            block
            :loading="isCreating"
            :disabled="!canCreate"
            @click="createEvent"
          >
            Build the Bracket
          </AppButton>
          <p v-if="!canCreate" class="text-center font-mono text-xs tabular-nums text-ink-muted">
            {{ createDisabledReason }}
          </p>
          <AppButton variant="secondary" block @click="step = 1">Back</AppButton>
        </template>
      </div>

      <!-- Desktop actions -->
      <div class="hidden items-center justify-end gap-3 border-t border-line pt-4 md:flex">
        <p v-if="!canCreate" class="mr-auto font-mono text-xs tabular-nums text-ink-muted">
          {{ createDisabledReason }}
        </p>
        <AppButton variant="secondary" @click="router.back()">Cancel</AppButton>
        <AppButton variant="broadcast" :loading="isCreating" :disabled="!canCreate" @click="createEvent">
          Build the Bracket
        </AppButton>
      </div>
    </div>
  </div>
</template>
