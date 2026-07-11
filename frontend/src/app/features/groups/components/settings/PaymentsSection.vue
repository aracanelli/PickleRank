<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsForm } from './settings-form'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppSelect from '@/app/core/ui/components/AppSelect.vue'
import ToggleSwitch from '@/app/core/ui/components/ToggleSwitch.vue'

const form = defineModel<SettingsForm>('form', { required: true })

const currencyOptions = [
  { label: 'USD ($)', value: 'USD' },
  { label: 'EUR (€)', value: 'EUR' },
  { label: 'GBP (£)', value: 'GBP' },
  { label: 'CAD ($)', value: 'CAD' },
  { label: 'AUD ($)', value: 'AUD' }
]

const subFee = computed<string | number>({
  get: () => form.value.subFeePerAttendance,
  set: (v) => {
    form.value.subFeePerAttendance = Number(v)
  }
})
</script>

<template>
  <section class="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-ink-muted">Payments</h2>

    <ToggleSwitch
      v-model="form.trackPayments"
      label="Track payments"
      description="Track sub player attendance fees and payments"
    />

    <div v-if="form.trackPayments" class="grid grid-cols-2 gap-3 border-t border-line pt-3">
      <AppInput
        v-model="subFee"
        label="Fee per attendance"
        type="number"
        inputmode="decimal"
        hint="Charged each time a sub attends"
      />
      <AppSelect v-model="form.paymentCurrency" label="Currency" :options="currencyOptions" />
    </div>
  </section>
</template>
