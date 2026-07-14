<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppSelect from '@/app/core/ui/components/AppSelect.vue'
import type { GroupPlayerDto, SpondResolvedAttendeeDto, SpondAttendeeLinkInput } from '@/app/core/models/dto'

const props = defineProps<{
  /** Attendees that could not be resolved automatically. */
  attendees: SpondResolvedAttendeeDto[]
  /** Current group roster, for the "link to existing player" options. */
  players: GroupPlayerDto[]
}>()

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ confirm: [links: SpondAttendeeLinkInput[]] }>()

const CREATE = '__create__'
const SKIP = '__skip__'

// spondMemberId -> chosen value (CREATE | SKIP | groupPlayerId)
const choices = ref<Record<string, string>>({})

watch(
  () => props.attendees,
  (list) => {
    const next: Record<string, string> = {}
    for (const a of list) {
      next[a.spondMemberId] = a.suggestedGroupPlayerId ?? CREATE
    }
    choices.value = next
  },
  { immediate: true }
)

function optionsFor() {
  return [
    { label: '➕ Create as new player', value: CREATE },
    ...props.players.map((p) => ({ label: p.displayName, value: p.id })),
    { label: "Skip — don't add", value: SKIP }
  ]
}

const confirmLabel = computed(() => {
  const adding = props.attendees.filter((a) => choices.value[a.spondMemberId] !== SKIP).length
  return adding > 0 ? `Add ${adding} player${adding === 1 ? '' : 's'}` : 'Continue'
})

function submit() {
  const links: SpondAttendeeLinkInput[] = []
  for (const a of props.attendees) {
    const choice = choices.value[a.spondMemberId]
    if (choice === SKIP) continue
    if (choice === CREATE) {
      links.push({ spondMemberId: a.spondMemberId, createName: a.name })
    } else {
      links.push({ spondMemberId: a.spondMemberId, groupPlayerId: choice })
    }
  }
  emit('confirm', links)
}
</script>

<template>
  <Sheet
    v-model="open"
    title="Link Spond attendees"
    size="lg"
  >
    <div class="flex flex-col gap-4">
      <p class="text-sm text-ink-muted">
        These attendees aren't linked to a player yet. Match each one to an existing player or
        create a new one. We'll remember your choices for next time.
      </p>

      <div
        v-for="a in attendees"
        :key="a.spondMemberId"
        class="flex flex-col gap-2 rounded-xl border border-line bg-surface-1 p-3"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="min-w-0 truncate text-sm font-semibold text-ink">{{ a.name }}</span>
          <span class="shrink-0 text-xs text-ink-faint">from Spond</span>
        </div>
        <AppSelect
          v-model="choices[a.spondMemberId]"
          :options="optionsFor()"
        />
      </div>
    </div>

    <template #footer>
      <AppButton
        block
        @click="submit"
      >
        {{ confirmLabel }}
      </AppButton>
    </template>
  </Sheet>
</template>
