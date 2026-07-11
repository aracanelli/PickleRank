<script setup lang="ts">
import { ref, watch } from 'vue'
import { History } from 'lucide-vue-next'
import { paymentsApi } from '../services/payments.api'
import type { SubBalanceDto, PaymentHistoryResponse, PaymentType } from '@/app/core/models/dto'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppBadge from '@/app/core/ui/components/AppBadge.vue'
import AppEmptyState from '@/app/core/ui/components/AppEmptyState.vue'
import ErrorState from '@/app/core/ui/components/ErrorState.vue'
import SkeletonList from '@/app/core/ui/components/SkeletonList.vue'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import { formatCurrency } from './currency'

const props = defineProps<{
  groupId: string
  player: SubBalanceDto | null
  currency: string
}>()

const open = defineModel<boolean>({ required: true })

const history = ref<PaymentHistoryResponse | null>(null)
const isLoading = ref(false)
const error = ref('')

watch(open, (isOpen) => {
  if (isOpen) void loadHistory()
})

async function loadHistory() {
  if (!props.player) return
  isLoading.value = true
  error.value = ''
  history.value = null
  try {
    history.value = await paymentsApi.getHistory(props.groupId, props.player.groupPlayerId)
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Failed to load payment history')
  } finally {
    isLoading.value = false
  }
}

const typeBadge: Record<PaymentType, { label: string; variant: 'muted' | 'success' | 'info' }> = {
  ATTENDANCE: { label: 'Attendance', variant: 'muted' },
  PAYMENT: { label: 'Payment', variant: 'success' },
  ADJUSTMENT: { label: 'Adjustment', variant: 'info' }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}
</script>

<template>
  <Sheet v-model="open" :title="player?.displayName || 'Payment history'" size="lg">
    <div v-if="player" class="flex flex-col gap-4">
      <div class="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-ink-muted">Current balance</span>
          <span
            class="font-mono text-xl font-bold tabular-nums"
            :class="player.balance < 0 ? 'text-loss' : player.balance > 0 ? 'text-win' : 'text-ink-muted'"
          >
            {{ player.balance < 0 ? `${formatCurrency(Math.abs(player.balance), currency)} owed` : formatCurrency(player.balance, currency) }}
          </span>
        </div>
        <div class="grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
          <div class="flex flex-col">
            <span class="font-mono text-sm font-semibold tabular-nums text-ink">{{ player.totalAttendances }}</span>
            <span class="text-xs text-ink-faint">Attendances</span>
          </div>
          <div class="flex flex-col">
            <span class="font-mono text-sm font-semibold tabular-nums text-ink">{{ formatCurrency(player.totalCharges, currency) }}</span>
            <span class="text-xs text-ink-faint">Charged</span>
          </div>
          <div class="flex flex-col">
            <span class="font-mono text-sm font-semibold tabular-nums text-ink">{{ formatCurrency(player.totalPayments, currency) }}</span>
            <span class="text-xs text-ink-faint">Paid</span>
          </div>
        </div>
        <p v-if="player.lastPaymentDate" class="text-xs text-ink-faint">
          Last payment: {{ formatDate(player.lastPaymentDate) }}
        </p>
      </div>

      <SkeletonList v-if="isLoading" :rows="4" />

      <ErrorState v-else-if="error" :message="error" @retry="loadHistory" />

      <AppEmptyState
        v-else-if="history && history.history.length === 0"
        title="No history"
        description="No payment records found for this player."
      >
        <template #icon><History class="size-7" /></template>
      </AppEmptyState>

      <div v-else-if="history" class="overflow-hidden rounded-xl border border-line bg-surface-1">
        <div class="divide-y divide-line">
          <div v-for="item in history.history" :key="item.id" class="flex items-start gap-3 px-4 py-3">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="flex flex-wrap items-center gap-1.5">
                <AppBadge :variant="typeBadge[item.paymentType].variant">
                  {{ typeBadge[item.paymentType].label }}
                </AppBadge>
                <span v-if="item.eventName" class="truncate text-sm text-ink-muted">{{ item.eventName }}</span>
              </span>
              <span class="text-xs text-ink-faint">{{ formatDate(item.createdAt) }}</span>
              <span v-if="item.notes" class="text-sm italic text-ink-muted">{{ item.notes }}</span>
            </div>
            <span
              class="shrink-0 font-mono text-sm font-bold tabular-nums"
              :class="item.amount > 0 ? 'text-win' : item.amount < 0 ? 'text-loss' : 'text-ink-muted'"
            >
              {{ item.amount > 0 ? '+' : '' }}{{ formatCurrency(item.amount, currency) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Sheet>
</template>
