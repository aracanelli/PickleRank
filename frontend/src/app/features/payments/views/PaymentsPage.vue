<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, DollarSign, RefreshCw } from 'lucide-vue-next'
import { paymentsApi } from '../services/payments.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { api } from '@/app/core/http/api-client'
import type { GroupDto, SubBalanceDto } from '@/app/core/models/dto'
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
import Fab from '@/app/core/ui/components/Fab.vue'
import PullRefresh from '@/app/core/ui/components/PullRefresh.vue'
import BalanceCard from '../components/BalanceCard.vue'
import PlayerLedgerSheet from '../components/PlayerLedgerSheet.vue'
import RecordPaymentSheet from '../components/RecordPaymentSheet.vue'
import { formatCurrency } from '../components/currency'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const groupContext = useGroupContextStore()
const toast = useToast()
const { confirm } = useConfirm()

const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const balances = ref<SubBalanceDto[]>([])
const totalOwed = ref(0)
const isLoading = ref(true)
const error = ref('')

const showRecordSheet = ref(false)
const showLedgerSheet = ref(false)
const selectedPlayerId = ref<string | null>(null)
const markingPaidId = ref<string | null>(null)
const isBackfilling = ref(false)

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
    syncGroupContext(groupRes, playersRes.players)

    // Ported: balances only exist when payment tracking is enabled
    if (!groupRes.settings.paymentSettings?.trackPayments) return

    const balancesRes = await paymentsApi.getBalances(groupId.value)
    balances.value = balancesRes.balances
    totalOwed.value = balancesRes.totalOwed
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load payment data')
  } finally {
    isLoading.value = false
  }
}

function syncGroupContext(g: GroupDto, players: Array<{ id: string; userId?: string; role: 'ORGANIZER' | 'PLAYER' }>) {
  const userId = authStore.userId
  const myPlayer = players.find((p) => p.userId && p.userId === userId) || null
  let role: GroupRole = null
  if (userId && g.ownerUserId === userId) role = 'OWNER'
  else if (myPlayer) role = myPlayer.role
  groupContext.setGroup({
    groupId: groupId.value,
    groupName: g.name,
    myPlayerId: myPlayer?.id ?? null,
    role
  })
}

const canManage = computed(() => groupContext.canManage)
const trackingEnabled = computed(() => group.value?.settings.paymentSettings?.trackPayments ?? false)
const currency = computed(() => group.value?.settings.paymentSettings?.currency || 'USD')

const selectedPlayer = computed(
  () => balances.value.find((b) => b.groupPlayerId === selectedPlayerId.value) ?? null
)

function openLedger(player: SubBalanceDto) {
  selectedPlayerId.value = player.groupPlayerId
  showLedgerSheet.value = true
}

async function markAllPaid(player: SubBalanceDto) {
  if (player.balance >= 0) return
  const ok = await confirm({
    title: 'Mark as paid?',
    message: `Record a payment of ${formatCurrency(Math.abs(player.balance), currency.value)} to settle ${player.displayName}'s balance?`,
    confirmLabel: 'Mark paid'
  })
  if (!ok) return
  markingPaidId.value = player.groupPlayerId
  try {
    await paymentsApi.markAllPaid(groupId.value, player.groupPlayerId)
    toast.success(`${player.displayName} marked as paid`)
    await loadData(true)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to mark as paid'))
  } finally {
    markingPaidId.value = null
  }
}

async function backfillCharges() {
  const ok = await confirm({
    title: 'Recalculate history?',
    message:
      'Retroactively charge subs for all completed events? Each sub is charged the current fee per attendance for every event they attended before tracking was enabled.',
    confirmLabel: 'Recalculate'
  })
  if (!ok) return
  isBackfilling.value = true
  try {
    const result = await paymentsApi.backfillCharges(groupId.value)
    toast.success(
      `${result.eventsProcessed} events processed, ${result.chargesCreated} charges created (${formatCurrency(result.totalAmount, currency.value)} total)`
    )
    await loadData(true)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to backfill charges'))
  } finally {
    isBackfilling.value = false
  }
}

async function refresh() {
  api.invalidateCache(`/api/groups/${groupId.value}`)
  api.invalidateCache(`/api/groups/${groupId.value}/players`)
  api.invalidateCache(`/api/groups/${groupId.value}/payments/balances`)
  await loadData(true)
}
</script>

<template>
  <HeaderActions>
    <IconButton
      v-if="canManage && trackingEnabled"
      label="Recalculate history"
      :disabled="isBackfilling"
      @click="backfillCharges"
    >
      <RefreshCw class="size-5" :class="isBackfilling ? 'animate-spin' : ''" />
    </IconButton>
  </HeaderActions>

  <PullRefresh :on-refresh="refresh">
    <div class="mx-auto w-full max-w-5xl px-4 md:px-6 py-5">
      <SkeletonList v-if="isLoading" :rows="5" avatar />

      <ErrorState v-else-if="error" :message="error" @retry="loadData()" />

      <AppEmptyState
        v-else-if="!trackingEnabled"
        title="Payment tracking is off"
        description="Payment tracking is not enabled for this group. Enable it in Group Settings."
      >
        <template #icon><DollarSign class="size-7" /></template>
        <template v-if="canManage" #action>
          <AppButton @click="router.push(`/groups/${groupId}/settings`)">Go to settings</AppButton>
        </template>
      </AppEmptyState>

      <AppEmptyState
        v-else-if="balances.length === 0"
        title="No sub players"
        description="When sub players attend events, their balances will appear here."
      >
        <template #icon><DollarSign class="size-7" /></template>
      </AppEmptyState>

      <div v-else class="flex flex-col gap-4">
        <div class="flex items-center justify-between rounded-xl border border-line bg-surface-1 p-4">
          <span class="text-sm font-medium text-ink-muted">Total owed</span>
          <span
            class="font-mono text-2xl font-bold tabular-nums"
            :class="totalOwed > 0 ? 'text-loss' : 'text-ink-muted'"
          >
            {{ formatCurrency(totalOwed, currency) }}
          </span>
        </div>

        <div class="flex flex-col gap-2 md:grid md:grid-cols-2 lg:grid-cols-3">
          <BalanceCard
            v-for="player in balances"
            :key="player.groupPlayerId"
            :player="player"
            :currency="currency"
            :can-manage="canManage"
            :marking-paid="markingPaidId === player.groupPlayerId"
            @click="openLedger(player)"
            @mark-paid="markAllPaid(player)"
          />
        </div>
      </div>
    </div>
  </PullRefresh>

  <Fab v-if="canManage && trackingEnabled && balances.length > 0" label="Record payment" @click="showRecordSheet = true">
    <Plus class="size-5" />
  </Fab>

  <PlayerLedgerSheet
    v-model="showLedgerSheet"
    :group-id="groupId"
    :player="selectedPlayer"
    :currency="currency"
  />

  <RecordPaymentSheet
    v-model="showRecordSheet"
    :group-id="groupId"
    :balances="balances"
    :currency="currency"
    @recorded="loadData(true)"
  />
</template>
