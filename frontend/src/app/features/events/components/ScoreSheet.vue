<script setup lang="ts">
import { ref, watch } from 'vue'
import { Check, ChevronRight, Loader2 } from 'lucide-vue-next'
import type { GameDto } from '@/app/core/models/dto'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import Stepper from '@/app/core/ui/components/Stepper.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'

const props = withDefaults(
  defineProps<{
    game: GameDto | null
    saving?: boolean
    saved?: boolean
  }>(),
  { saving: false, saved: false }
)

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  /** Stepper tap — debounced autosave. */
  change: [gameId: string, score1: number, score2: number]
  /** Close / next — immediate save. */
  commit: [gameId: string, score1: number, score2: number]
  next: []
}>()

const score1 = ref(0)
const score2 = ref(0)
// Only persist if the user actually changed something — opening and closing
// an unscored game must NOT record a 0–0 result.
const touched = ref(false)

function syncFromGame() {
  score1.value = props.game?.scoreTeam1 ?? 0
  score2.value = props.game?.scoreTeam2 ?? 0
  touched.value = false
}

watch(() => props.game?.id, syncFromGame, { immediate: true })
watch(open, (isOpen) => {
  if (isOpen) syncFromGame()
  else commitIfTouched()
})

function onStepperChange() {
  if (!props.game) return
  touched.value = true
  emit('change', props.game.id, score1.value, score2.value)
}

function commitIfTouched() {
  if (!props.game || !touched.value) return
  emit('commit', props.game.id, score1.value, score2.value)
  touched.value = false
}

function onNext() {
  commitIfTouched()
  emit('next')
}
</script>

<template>
  <Sheet v-model="open" :title="game ? `Court ${game.courtIndex + 1} · Round ${game.roundIndex + 1}` : ''">
    <div v-if="game" class="flex flex-col gap-5 py-1">
      <div
        v-for="side in [1, 2] as const"
        :key="side"
        class="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-2/50 p-4"
      >
        <div class="min-w-0 flex-1">
          <p
            v-for="p in side === 1 ? game.team1 : game.team2"
            :key="p.id"
            class="truncate text-base font-medium text-ink"
          >
            {{ p.displayName }}
          </p>
        </div>
        <Stepper
          v-if="side === 1"
          v-model="score1"
          size="lg"
          :min="0"
          :max="99"
          label="Score"
          @update:model-value="onStepperChange"
        />
        <Stepper
          v-else
          v-model="score2"
          size="lg"
          :min="0"
          :max="99"
          label="Score"
          @update:model-value="onStepperChange"
        />
      </div>

      <p class="min-h-5 text-center text-xs" aria-live="polite">
        <span v-if="saving" class="inline-flex items-center gap-1 text-brand">
          <Loader2 class="size-3.5 animate-spin" aria-hidden="true" /> Saving…
        </span>
        <span v-else-if="saved" class="inline-flex items-center gap-1 text-win">
          <Check class="size-3.5" aria-hidden="true" /> Saved
        </span>
        <span v-else class="text-ink-faint">Scores save automatically · ties are allowed</span>
      </p>
    </div>

    <template #footer>
      <AppButton block @click="onNext">
        Next game
        <ChevronRight class="size-4" aria-hidden="true" />
      </AppButton>
    </template>
  </Sheet>
</template>
