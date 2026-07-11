<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { Info } from 'lucide-vue-next'
import { groupsApi } from '../services/groups.api'
import { api } from '@/app/core/http/api-client'
import type { GroupDto } from '@/app/core/models/dto'
import { useAuthStore } from '@/stores/auth'
import { useGroupContextStore, type GroupRole } from '@/stores/group-context'
import { useToast } from '@/app/core/ui/composables/useToast'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import PullRefresh from '@/app/core/ui/components/PullRefresh.vue'
import type { SettingsForm } from '../components/settings/settings-form'
import GeneralSection from '../components/settings/GeneralSection.vue'
import RatingSystemSection from '../components/settings/RatingSystemSection.vue'
import MatchmakingSection from '../components/settings/MatchmakingSection.vue'
import PaymentsSection from '../components/settings/PaymentsSection.vue'
import DangerSection from '../components/settings/DangerSection.vue'

const route = useRoute()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()
const toast = useToast()

const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const isLoading = ref(true)
const isSaving = ref(false)
const error = ref('')

const form = reactive<SettingsForm>({
  ratingSystem: 'SERIOUS_ELO',
  initialRating: 1000,
  kFactor: 32,
  eloConst: undefined,
  eloDiff: 0.05,
  noRepeatTeammateInEvent: true,
  noRepeatTeammateFromPreviousEvent: true,
  noRepeatOpponentInEvent: true,
  autoRelaxEloDiff: true,
  autoRelaxStep: 0.01,
  autoRelaxMaxEloDiff: 0.25,
  defaultRounds: 1,
  trackPayments: false,
  subFeePerAttendance: 5.0,
  paymentCurrency: 'USD'
})

const snapshot = ref('')
const isInitialLoad = ref(true)

const dirty = computed(() => snapshot.value !== '' && JSON.stringify(form) !== snapshot.value)
const canManage = computed(() => groupContext.canManage)

onMounted(() => loadGroup())

async function loadGroup(silent = false) {
  if (!silent) isLoading.value = true
  error.value = ''
  isInitialLoad.value = true
  try {
    const [groupRes, playersRes] = await Promise.all([
      groupsApi.get(groupId.value),
      groupsApi.getPlayers(groupId.value)
    ])
    group.value = groupRes
    populateForm(groupRes)

    // Group context + role derivation (only managers may save)
    const userId = authStore.userId
    const myPlayer = playersRes.players.find((p) => p.userId && p.userId === userId) || null
    let role: GroupRole = null
    if (userId && groupRes.ownerUserId === userId) role = 'OWNER'
    else if (myPlayer) role = myPlayer.role
    groupContext.setGroup({
      groupId: groupId.value,
      groupName: groupRes.name,
      myPlayerId: myPlayer?.id ?? null,
      role
    })
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load group')
  } finally {
    isLoading.value = false
    // Allow the rating-system watcher to run only after the initial load
    // settles (the populate itself must not trigger the defaults watcher).
    void nextTick(() => {
      isInitialLoad.value = false
    })
  }
}

function populateForm(g: GroupDto) {
  const s = g.settings
  form.ratingSystem = s.ratingSystem
  form.initialRating = s.initialRating
  form.kFactor = s.kFactor
  // Use saved eloConst, or default based on rating system (ported behavior)
  form.eloConst = s.eloConst != null ? s.eloConst : s.ratingSystem === 'RACS_ELO' ? 0.3 : 400
  form.eloDiff = s.eloDiff
  form.noRepeatTeammateInEvent = s.noRepeatTeammateInEvent
  form.noRepeatTeammateFromPreviousEvent = s.noRepeatTeammateFromPreviousEvent
  form.noRepeatOpponentInEvent = s.noRepeatOpponentInEvent
  form.autoRelaxEloDiff = s.autoRelaxEloDiff
  form.autoRelaxStep = s.autoRelaxStep
  form.autoRelaxMaxEloDiff = s.autoRelaxMaxEloDiff
  form.defaultRounds = s.defaultRounds || 1
  form.trackPayments = s.paymentSettings?.trackPayments || false
  form.subFeePerAttendance = s.paymentSettings?.subFeePerAttendance || 5.0
  form.paymentCurrency = s.paymentSettings?.currency || 'USD'
  snapshot.value = JSON.stringify(form)
}

// Auto-populate defaults when the rating system changes (ported behavior)
watch(
  () => form.ratingSystem,
  (newValue) => {
    if (isInitialLoad.value) return
    if (newValue === 'RACS_ELO') {
      form.kFactor = 100
      form.eloConst = 0.3
    } else {
      form.kFactor = 32
      form.eloConst = 400
    }
  }
)

async function saveSettings() {
  isSaving.value = true
  try {
    await groupsApi.updateSettings(groupId.value, {
      ratingSystem: form.ratingSystem,
      initialRating: form.initialRating,
      kFactor: form.kFactor,
      eloConst: form.eloConst,
      eloDiff: form.eloDiff,
      noRepeatTeammateInEvent: form.noRepeatTeammateInEvent,
      noRepeatTeammateFromPreviousEvent: form.noRepeatTeammateFromPreviousEvent,
      noRepeatOpponentInEvent: form.noRepeatOpponentInEvent,
      autoRelaxEloDiff: form.autoRelaxEloDiff,
      autoRelaxStep: form.autoRelaxStep,
      autoRelaxMaxEloDiff: form.autoRelaxMaxEloDiff,
      defaultRounds: form.defaultRounds,
      paymentSettings: {
        trackPayments: form.trackPayments,
        subFeePerAttendance: form.subFeePerAttendance,
        currency: form.paymentCurrency
      }
    })
    snapshot.value = JSON.stringify(form)
    toast.success('Settings saved')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to save settings'))
  } finally {
    isSaving.value = false
  }
}

function discardChanges() {
  if (!snapshot.value) return
  isInitialLoad.value = true
  Object.assign(form, JSON.parse(snapshot.value) as SettingsForm)
  // Re-arm the rating-system watcher after the restore settles
  void nextTick(() => {
    isInitialLoad.value = false
  })
}

function onRenamed(updated: GroupDto) {
  group.value = updated
  groupContext.setGroup({ groupId: groupId.value, groupName: updated.name })
}

async function refresh() {
  api.invalidateCache(`/api/groups/${groupId.value}`)
  api.invalidateCache(`/api/groups/${groupId.value}/players`)
  await loadGroup(true)
}
</script>

<template>
  <PullRefresh :on-refresh="refresh">
    <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5" :class="dirty ? 'pb-28' : ''">
      <SkeletonList v-if="isLoading" :rows="5" />

      <ErrorState v-else-if="error" :message="error" @retry="loadGroup()" />

      <div v-else-if="group" class="flex flex-col gap-4">
        <div class="flex items-start gap-2 rounded-xl border border-info/30 bg-info/10 p-3 text-sm text-ink-muted">
          <Info class="mt-0.5 size-4 shrink-0 text-info" />
          Changes affect future events; history stays as recorded.
        </div>

        <GeneralSection :group-id="groupId" :current-name="group.name" @renamed="onRenamed" />
        <RatingSystemSection :form="form" />
        <MatchmakingSection :form="form" />
        <PaymentsSection :form="form" />
        <DangerSection v-if="canManage" :group-id="groupId" />
      </div>
    </div>
  </PullRefresh>

  <!-- Sticky save bar: sits above the bottom tab bar when there are unsaved changes -->
  <Transition
    enter-active-class="transition-transform duration-200"
    enter-from-class="translate-y-full"
    leave-active-class="transition-transform duration-200"
    leave-to-class="translate-y-full"
  >
    <div
      v-if="dirty && canManage"
      class="fixed inset-x-0 z-30 border-t border-line bg-surface-1/95 backdrop-blur bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0"
    >
      <div class="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <span class="text-sm font-medium text-ink-muted">Unsaved changes</span>
        <div class="flex gap-2">
          <AppButton variant="secondary" size="sm" :disabled="isSaving" @click="discardChanges">
            Discard
          </AppButton>
          <AppButton size="sm" :loading="isSaving" @click="saveSettings">Save</AppButton>
        </div>
      </div>
    </div>
  </Transition>
</template>
