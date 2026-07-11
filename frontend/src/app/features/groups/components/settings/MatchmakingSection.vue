<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsForm } from './settings-form'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import ToggleSwitch from '@/app/core/ui/components/ToggleSwitch.vue'
import Stepper from '@/app/core/ui/components/Stepper.vue'

const props = defineProps<{
  form: SettingsForm
}>()

const autoRelaxStep = computed<string | number>({
  get: () => props.form.autoRelaxStep,
  set: (v) => {
    props.form.autoRelaxStep = Number(v)
  }
})

const autoRelaxMaxEloDiff = computed<string | number>({
  get: () => props.form.autoRelaxMaxEloDiff,
  set: (v) => {
    props.form.autoRelaxMaxEloDiff = Number(v)
  }
})
</script>

<template>
  <section class="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-ink-muted">Matchmaking</h2>

    <div class="flex flex-col divide-y divide-line">
      <ToggleSwitch
        v-model="form.noRepeatTeammateInEvent"
        label="No repeat teammate in event"
        description="Avoid pairing the same teammates twice in one event"
      />
      <ToggleSwitch
        v-model="form.noRepeatTeammateFromPreviousEvent"
        label="No repeat teammate from previous event"
        description="Avoid teammates from the last event"
      />
      <ToggleSwitch
        v-model="form.noRepeatOpponentInEvent"
        label="No repeat opponent in event"
        description="Avoid facing the same opponents twice in one event"
      />
      <ToggleSwitch
        v-model="form.autoRelaxEloDiff"
        label="Auto-relax constraints"
        description="Loosen the Elo balance limit if no valid schedule is found"
      />
    </div>

    <div v-if="form.autoRelaxEloDiff" class="grid grid-cols-2 gap-3">
      <AppInput
        v-model="autoRelaxStep"
        label="Relax step"
        type="number"
        inputmode="decimal"
        hint="Added each retry"
      />
      <AppInput
        v-model="autoRelaxMaxEloDiff"
        label="Max Elo diff"
        type="number"
        inputmode="decimal"
        hint="Relaxation ceiling"
      />
    </div>

    <div class="flex items-center justify-between gap-4 border-t border-line pt-3">
      <span class="flex flex-col">
        <span class="text-sm font-medium text-ink">Default rounds</span>
        <span class="text-sm text-ink-faint">Pre-filled when creating an event</span>
      </span>
      <Stepper v-model="form.defaultRounds" :min="1" :max="10" />
    </div>
  </section>
</template>
