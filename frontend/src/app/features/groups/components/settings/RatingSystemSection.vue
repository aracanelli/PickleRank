<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown, Target, PartyPopper, Rocket, type LucideIcon } from 'lucide-vue-next'
import type { SettingsForm } from './settings-form'
import AppInput from '@/app/core/ui/components/AppInput.vue'

const props = defineProps<{
  form: SettingsForm
}>()

const systems: Array<{
  value: SettingsForm['ratingSystem']
  title: string
  description: string
  icon: LucideIcon
}> = [
  {
    value: 'SERIOUS_ELO',
    title: 'Serious Elo',
    description: 'Classic team-average Elo',
    icon: Target
  },
  {
    value: 'CATCH_UP',
    title: 'Catch-Up',
    description: 'Boosts underdogs to keep games close',
    icon: PartyPopper
  },
  {
    value: 'RACS_ELO',
    title: 'RACS',
    description: 'Volatile, score-margin driven',
    icon: Rocket
  }
]

const showAdvanced = ref(false)

// AppInput's v-model round-trips numbers as strings — coerce on write.
const initialRating = computed<string | number>({
  get: () => props.form.initialRating,
  set: (v) => {
    props.form.initialRating = Number(v)
  }
})

const kFactor = computed<string | number>({
  get: () => props.form.kFactor,
  set: (v) => {
    props.form.kFactor = Number(v)
  }
})

const eloConst = computed<string | number>({
  get: () => props.form.eloConst ?? '',
  set: (v) => {
    props.form.eloConst = v === '' ? undefined : Number(v)
  }
})

// Legacy displayed eloDiff (0.01–0.5) as a percentage — keep that convention.
const eloDiffPercent = computed<string | number>({
  get: () => Math.round(props.form.eloDiff * 100),
  set: (v) => {
    props.form.eloDiff = Number(v) / 100
  }
})
</script>

<template>
  <section class="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-ink-muted">Rating system</h2>

    <div class="flex flex-col gap-2" role="radiogroup" aria-label="Rating system">
      <button
        v-for="system in systems"
        :key="system.value"
        type="button"
        role="radio"
        :aria-checked="form.ratingSystem === system.value"
        class="flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-colors"
        :class="
          form.ratingSystem === system.value
            ? 'border-brand bg-brand-soft'
            : 'border-line bg-surface-1 hover:bg-surface-2'
        "
        @click="form.ratingSystem = system.value"
      >
        <component
          :is="system.icon"
          class="size-5 shrink-0"
          :class="form.ratingSystem === system.value ? 'text-brand' : 'text-ink-faint'"
        />
        <span class="flex flex-col">
          <span class="text-sm font-semibold text-ink">{{ system.title }}</span>
          <span class="text-sm text-ink-muted">{{ system.description }}</span>
        </span>
      </button>
    </div>

    <button
      type="button"
      class="flex min-h-11 items-center justify-between rounded-lg px-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
      :aria-expanded="showAdvanced"
      @click="showAdvanced = !showAdvanced"
    >
      Advanced
      <ChevronDown class="size-4 transition-transform" :class="showAdvanced ? 'rotate-180' : ''" />
    </button>

    <div v-show="showAdvanced" class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3">
        <AppInput
          v-model="initialRating"
          label="Initial rating"
          type="number"
          inputmode="numeric"
          hint="0–3000"
        />
        <AppInput v-model="kFactor" label="K-factor" type="number" inputmode="numeric" hint="1–200" />
      </div>
      <AppInput
        v-model="eloConst"
        label="Elo constant"
        type="number"
        inputmode="decimal"
        hint="Rating sensitivity — defaults follow the selected system"
      />
      <AppInput
        v-model="eloDiffPercent"
        label="Max Elo difference (%)"
        type="number"
        inputmode="numeric"
        hint="1–50% — maximum allowed rating imbalance between teams"
      />
    </div>
  </section>
</template>
