<script setup lang="ts">
import type { MatchHistoryEntryDto } from '@/app/core/models/dto'

// Compact "final score" rows for the last few matches; the full feed lives on
// the history page.
defineProps<{
  matches: MatchHistoryEntryDto[]
  groupId: string
}>()

function sideClass(match: MatchHistoryEntryDto, side: 'TEAM1_WIN' | 'TEAM2_WIN'): string {
  return match.result === side ? 'text-win font-semibold' : 'text-ink-muted'
}

function score(value?: number): string {
  return value === undefined || value === null ? '–' : String(value)
}
</script>

<template>
  <section v-if="matches.length" class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between">
      <h2 class="eyebrow text-ink-faint">Recent results</h2>
      <RouterLink
        :to="`/groups/${groupId}/history`"
        class="text-sm font-medium text-accent-text"
      >
        View feed →
      </RouterLink>
    </div>

    <div class="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface-1">
      <div v-for="match in matches" :key="match.gameId" class="flex items-center gap-3 px-4 py-3">
        <span class="min-w-0 flex-1 truncate text-right text-sm" :class="sideClass(match, 'TEAM1_WIN')">
          {{ match.team1.join(' & ') }}
        </span>
        <span class="numeral h-6 shrink-0 text-lg leading-6">
          <span :class="sideClass(match, 'TEAM1_WIN')">{{ score(match.scoreTeam1) }}</span>
          <span class="px-1 text-ink-faint">–</span>
          <span :class="sideClass(match, 'TEAM2_WIN')">{{ score(match.scoreTeam2) }}</span>
        </span>
        <span class="min-w-0 flex-1 truncate text-sm" :class="sideClass(match, 'TEAM2_WIN')">
          {{ match.team2.join(' & ') }}
        </span>
      </div>
    </div>
  </section>
</template>
