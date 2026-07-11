<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { paymentsApi } from '../services/payments.api'
import type { SubBalanceDto } from '@/app/core/models/dto'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppSelect from '@/app/core/ui/components/AppSelect.vue'
import AppTextarea from '@/app/core/ui/components/AppTextarea.vue'
import SegmentedControl from '@/app/core/ui/components/SegmentedControl.vue'
import { useToast } from '@/app/core/ui/composables/useToast'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'
import { formatCurrency } from './currency'

const props = defineProps<{
  groupId: string
  balances: SubBalanceDto[]
  currency: string
}>()

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ recorded: [] }>()

const toast = useToast()

const groupPlayerId = ref<string | number>('')
const paymentType = ref('payment')
const amount = ref<string | number>('')
const notes = ref('')
const isSubmitting = ref(false)

const typeOptions = [
  { label: 'Payment', value: 'payment' },
  { label: 'Adjustment', value: 'adjustment' }
]

watch(open, (isOpen) => {
  if (isOpen) {
    groupPlayerId.value = ''
    paymentType.value = 'payment'
    amount.value = ''
    notes.value = ''
  }
})

const playerOptions = computed(() =>
  props.balances.map((b) => ({
    label:
      b.balance < 0
        ? `${b.displayName} — owes ${formatCurrency(Math.abs(b.balance), props.currency)}`
        : b.displayName,
    value: b.groupPlayerId
  }))
)

const selectedBalance = computed(
  () => props.balances.find((b) => b.groupPlayerId === groupPlayerId.value) ?? null
)

// Ported: recording a payment pre-fills the full amount owed
watch([groupPlayerId, paymentType], () => {
  if (paymentType.value === 'payment' && selectedBalance.value && selectedBalance.value.balance < 0) {
    amount.value = Math.abs(selectedBalance.value.balance)
  }
})

const amountNumber = computed(() => Number(amount.value))
const canSubmit = computed(
  () => !!groupPlayerId.value && Number.isFinite(amountNumber.value) && amountNumber.value > 0
)

async function submit() {
  if (!canSubmit.value || isSubmitting.value) return
  isSubmitting.value = true
  try {
    const data = {
      groupPlayerId: String(groupPlayerId.value),
      amount: amountNumber.value,
      notes: notes.value.trim() || undefined
    }
    if (paymentType.value === 'payment') {
      await paymentsApi.recordPayment(props.groupId, data)
      toast.success('Payment recorded')
    } else {
      await paymentsApi.recordAdjustment(props.groupId, data)
      toast.success('Adjustment recorded')
    }
    open.value = false
    emit('recorded')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to record payment'))
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Sheet v-model="open" title="Record payment" :persistent="isSubmitting">
    <div class="flex flex-col gap-4">
      <AppSelect v-model="groupPlayerId" label="Player" :options="playerOptions" placeholder="Select a player" />

      <SegmentedControl v-model="paymentType" :options="typeOptions" />

      <AppInput
        v-model="amount"
        label="Amount"
        type="number"
        inputmode="decimal"
        placeholder="0.00"
        :hint="
          paymentType === 'payment'
            ? 'Money received from the player'
            : 'Credit applied to the player\'s balance'
        "
      />

      <AppTextarea v-model="notes" label="Notes (optional)" :rows="2" placeholder="Add any notes about this payment..." />
    </div>

    <template #footer>
      <div class="flex gap-2">
        <AppButton variant="secondary" block :disabled="isSubmitting" @click="open = false">Cancel</AppButton>
        <AppButton block :loading="isSubmitting" :disabled="!canSubmit" @click="submit">
          {{ paymentType === 'payment' ? 'Record payment' : 'Save adjustment' }}
        </AppButton>
      </div>
    </template>
  </Sheet>
</template>
