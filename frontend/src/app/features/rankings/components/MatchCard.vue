<script setup lang="ts">
import { computed } from 'vue'
import { Pencil } from 'lucide-vue-next'
import type { MatchHistoryEntryDto } from '@/app/core/models/dto'
import IconButton from '@/app/core/ui/components/IconButton.vue'

// Broadcast result row: stacked team names with scoreboard numerals on the
// right. Winner reads in win color; ties read tie on both sides.
const props = withDefaults(
  defineProps<{
    match: MatchHistoryEntryDto
    /** Show the date/event caption line (hidden when the list already groups by event). */
    showCaption?: boolean
    /** Show the per-game score edit button (organizers only). */
    editable?: boolean
  }>(),
  { showCaption: false, editable: false }
)

const emit = defineEmits<{ edit: [match: MatchHistoryEntryDto] }>()

const isTie = computed(() => props.match.result === 'TIE')
const team1Won = computed(() => props.match.result === 'TEAM1_WIN')
const team2Won = computed(() => props.match.result === 'TEAM2_WIN')

function nameClass(won: boolean): string {
  if (isTie.value) return 'text-tie'
  return won ? 'font-semibold text-win' : 'text-ink-muted'
}

function scoreClass(won: boolean): string {
  if (isTie.value) return 'text-tie'
  return won ? 'text-win' : 'text-ink-muted'
}

const captionDate = computed(() =>
  new Date(props.match.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
)
</script>

<template>
  <div class="rounded-[14px] border border-line bg-surface-1 px-3.5 py-3">
    <p v-if="showCaption" class="mb-2 truncate eyebrow text-ink-faint">
      {{ match.eventName || 'Event' }} · {{ captionDate }}
    </p>

    <div class="flex flex-col gap-1">
      <!-- Team 1 row -->
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p
            v-for="name in match.team1"
            :key="name"
            class="truncate text-sm leading-5"
            :class="nameClass(team1Won)"
          >
            {{ name }}
          </p>
        </div>
        <span
          class="w-9 shrink-0 text-right numeral text-xl"
          :class="scoreClass(team1Won)"
        >{{ match.scoreTeam1 ?? '–' }}</span>
      </div>

      <div class="h-px bg-line" aria-hidden="true" />

      <!-- Team 2 row -->
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p
            v-for="name in match.team2"
            :key="name"
            class="truncate text-sm leading-5"
            :class="nameClass(team2Won)"
          >
            {{ name }}
          </p>
        </div>
        <span
          class="w-9 shrink-0 text-right numeral text-xl"
          :class="scoreClass(team2Won)"
        >{{ match.scoreTeam2 ?? '–' }}</span>
      </div>
    </div>

    <!-- Caption + edit -->
    <div class="mt-1.5 flex min-h-5 items-center justify-between gap-2">
      <p class="text-xs text-ink-faint">
        Round {{ match.roundIndex + 1 }} · Court {{ match.courtIndex + 1 }}
        <template v-if="match.team1Elo != null && match.team2Elo != null">
          · ELO {{ match.team1Elo.toFixed(0) }}–{{ match.team2Elo.toFixed(0) }}
        </template>
        <span v-if="isTie" class="ml-1 font-semibold text-tie">Tie</span>
      </p>
      <IconButton v-if="editable" label="Edit score" @click="emit('edit', match)">
        <Pencil class="size-4" />
      </IconButton>
    </div>
  </div>
</template>
