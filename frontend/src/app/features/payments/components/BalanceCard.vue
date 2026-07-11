<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import type { SubBalanceDto } from '@/app/core/models/dto'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import AppBadge from '@/app/core/ui/components/AppBadge.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import { formatCurrency } from './currency'

const props = defineProps<{
  player: SubBalanceDto
  currency: string
  canManage: boolean
  markingPaid?: boolean
}>()

const emit = defineEmits<{ click: []; markPaid: [] }>()

const balanceLabel = computed(() => {
  if (props.player.balance < 0) return 'Owes'
  if (props.player.balance > 0) return 'Credit'
  return 'Settled'
})

const balanceClass = computed(() => {
  if (props.player.balance < 0) return 'text-loss'
  if (props.player.balance > 0) return 'text-win'
  return 'text-ink-muted'
})
</script>

<template>
  <div
    class="flex cursor-pointer flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4 transition-colors hover:bg-surface-2 active:bg-surface-2"
    role="button"
    tabindex="0"
    @click="emit('click')"
    @keydown.enter="emit('click')"
  >
    <div class="flex items-center gap-3">
      <Avatar :name="player.displayName" size="md" />
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="flex items-center gap-1.5">
          <span class="truncate text-sm font-medium text-ink">{{ player.displayName }}</span>
          <AppBadge :variant="player.membershipType === 'SUB' ? 'warning' : 'muted'">
            {{ player.membershipType === 'SUB' ? 'Sub' : 'Permanent' }}
          </AppBadge>
        </span>
        <span class="text-xs text-ink-faint">
          {{ player.totalAttendances }} attendance{{ player.totalAttendances !== 1 ? 's' : '' }}
        </span>
      </div>
      <div class="flex shrink-0 flex-col items-end">
        <span class="text-[0.6875rem] font-semibold uppercase tracking-wide" :class="balanceClass">
          {{ balanceLabel }}
        </span>
        <span class="font-mono text-xl font-bold tabular-nums" :class="balanceClass">
          {{ formatCurrency(Math.abs(player.balance), currency) }}
        </span>
      </div>
    </div>

    <AppButton
      v-if="canManage && player.balance < 0"
      variant="secondary"
      size="sm"
      :loading="markingPaid"
      @click.stop="emit('markPaid')"
    >
      <Check class="size-4" />
      Mark paid
    </AppButton>
  </div>
</template>
