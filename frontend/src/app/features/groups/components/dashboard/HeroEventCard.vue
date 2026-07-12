<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { EventListItemDto } from '@/app/core/models/dto'
import { eventsApi } from '@/app/features/events/services/events.api'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import LiveDot from '@/app/core/ui/components/LiveDot.vue'
import CourtLines from '@/app/core/ui/components/CourtLines.vue'

// The one big billboard on the club dashboard: the live event if a game night
// is running, otherwise the next scheduled event, otherwise a court-motif
// empty state.
const props = defineProps<{
  event: EventListItemDto | null
  canManage: boolean
  /** Group has completed events — flips the empty-state copy from
   *  "first event" to "next event". */
  hasHistory?: boolean
}>()

const emit = defineEmits<{ open: [] }>()

const isLive = computed(() => props.event?.status === 'IN_PROGRESS')

// Game counts exist only on the event detail payload — fetch lazily for the
// hero event alone, fail-soft (the card just hides the progress row).
const scoredGames = ref<number | null>(null)
const totalGames = ref<number | null>(null)

watch(
  () => (isLive.value ? props.event?.id : null),
  async (eventId) => {
    scoredGames.value = null
    totalGames.value = null
    if (!eventId) return
    try {
      const detail = await eventsApi.get(eventId)
      if (props.event?.id !== eventId) return
      totalGames.value = detail.games.length
      scoredGames.value = detail.games.filter((g) => g.result !== 'UNSET').length
    } catch (e) {
      console.error('Failed to load hero event details:', e)
    }
  },
  { immediate: true }
)

const progressPercent = computed(() => {
  if (scoredGames.value === null || !totalGames.value) return 0
  return Math.min(100, Math.round((scoredGames.value / totalGames.value) * 100))
})

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "THU · 7:00 PM" — broadcast schedule voice. */
const dayTime = computed(() => {
  if (!props.event?.startsAt) return ''
  const date = new Date(props.event.startsAt)
  if (isNaN(date.getTime())) return ''
  const day = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time}`
})

const title = computed(
  () => props.event?.name || formatDate(props.event?.startsAt) || 'Unnamed event'
)

const setupCaption = computed(() => {
  if (!props.event) return ''
  return `${props.event.courts} courts × ${props.event.rounds} rounds`
})
</script>

<template>
  <section
    class="relative overflow-hidden rounded-[20px] border border-line bg-surface-1 ticket-clip"
    :class="isLive ? 'shadow-glow stadium-glow' : ''"
  >
    <CourtLines crop="half" class="absolute -right-8 top-0 h-full w-auto" />

    <!-- LIVE: game night in progress -->
    <div v-if="event && isLive" class="relative flex flex-col gap-3 p-5">
      <div>
        <TapeChip variant="live"><LiveDot /> LIVE</TapeChip>
      </div>
      <h2 class="display-wide break-words text-xl text-ink">{{ title }}</h2>
      <div v-if="totalGames !== null" class="flex flex-col gap-2">
        <p class="eyebrow text-ink-faint">{{ scoredGames }} / {{ totalGames }} games scored</p>
        <div class="h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            class="h-full rounded-full bg-accent-fill transition-[width] duration-[var(--dur-slow)]"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
      </div>
      <AppButton variant="broadcast" block class="mt-1" @click="emit('open')">
        Enter Scoreboard
      </AppButton>
    </div>

    <!-- UP NEXT: scheduled event -->
    <div v-else-if="event" class="relative flex flex-col gap-3 p-5">
      <div>
        <TapeChip variant="info">UP NEXT</TapeChip>
      </div>
      <div class="flex flex-col gap-1">
        <h2 class="display-wide break-words text-xl text-ink">{{ title }}</h2>
        <p v-if="dayTime" class="numeral h-7 text-xl text-accent-text">{{ dayTime }}</p>
      </div>
      <p class="text-sm text-ink-faint">{{ setupCaption }}</p>
      <div>
        <AppButton variant="secondary" @click="emit('open')">Open event</AppButton>
      </div>
    </div>

    <!-- EMPTY: nothing on the schedule -->
    <div v-else class="relative flex flex-col gap-2 p-5 py-8">
      <h2 class="display-wide break-words text-lg text-ink">
        {{
          !canManage
            ? 'No upcoming events'
            : hasHistory
              ? 'Schedule the next event'
              : 'Schedule your first event'
        }}
      </h2>
      <p class="max-w-sm text-sm text-ink-muted">
        {{
          !canManage
            ? 'Check back once your organizer schedules the next game night.'
            : hasHistory
              ? "The last one's in the books — set up the next game night."
              : 'Set up courts and rounds — matchups generate themselves.'
        }}
      </p>
    </div>
  </section>
</template>
