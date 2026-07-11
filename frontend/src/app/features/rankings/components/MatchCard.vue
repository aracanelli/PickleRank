<script setup lang="ts">
import { computed } from 'vue'
import { Pencil } from 'lucide-vue-next'
import type { MatchHistoryEntryDto } from '@/app/core/models/dto'
import IconButton from '@/app/core/ui/components/IconButton.vue'

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

function teamClass(won: boolean): string {
  if (isTie.value) return 'text-tie'
  return won ? 'text-win font-semibold' : 'text-ink-muted'
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
  <div class="rounded-xl border border-line bg-surface-1 p-3.5">
    <p v-if="showCaption" class="mb-2 truncate text-xs text-ink-faint">
      {{ match.eventName || 'Event' }} · {{ captionDate }}
    </p>

    <div class="flex items-center gap-3">
      <!-- Team 1 -->
      <div class="min-w-0 flex-1">
        <p v-for="name in match.team1" :key="name" class="truncate text-sm" :class="teamClass(team1Won)">
          {{ name }}
        </p>
        <p v-if="match.team1Elo" class="mt-0.5 font-mono text-[10px] tabular-nums text-ink-faint">
          ELO {{ match.team1Elo.toFixed(1) }}
        </p>
      </div>

      <!-- Scores -->
      <div class="flex shrink-0 items-center gap-1.5 font-mono text-2xl font-bold tabular-nums">
        <span :class="scoreClass(team1Won)">{{ match.scoreTeam1 ?? '–' }}</span>
        <span class="text-sm font-medium text-ink-faint">:</span>
        <span :class="scoreClass(team2Won)">{{ match.scoreTeam2 ?? '–' }}</span>
      </div>

      <!-- Team 2 -->
      <div class="min-w-0 flex-1 text-right">
        <p v-for="name in match.team2" :key="name" class="truncate text-sm" :class="teamClass(team2Won)">
          {{ name }}
        </p>
        <p v-if="match.team2Elo" class="mt-0.5 font-mono text-[10px] tabular-nums text-ink-faint">
          ELO {{ match.team2Elo.toFixed(1) }}
        </p>
      </div>
    </div>

    <div class="mt-2 flex items-center justify-between">
      <p class="text-xs text-ink-faint">
        Round {{ match.roundIndex + 1 }} · Court {{ match.courtIndex + 1 }}
        <span v-if="isTie" class="ml-1 font-semibold text-tie">Tie</span>
      </p>
      <IconButton v-if="editable" label="Edit score" @click="emit('edit', match)">
        <Pencil class="size-4" />
      </IconButton>
    </div>
  </div>
</template>
