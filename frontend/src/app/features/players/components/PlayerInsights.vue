<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Flame, Skull, Target, Users } from 'lucide-vue-next'
import type { AdvancedStats, TeammateStat } from '@/app/core/models/dto'
import StatTile from '@/app/core/ui/components/StatTile.vue'
import ListItem from '@/app/core/ui/components/ListItem.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'

const props = defineProps<{
  advanced: AdvancedStats
  groupId: string
}>()

const router = useRouter()

function openPlayer(stat: TeammateStat) {
  router.push(`/groups/${props.groupId}/players/${stat.playerId}`)
}

function statDetail(stat: TeammateStat): string {
  return `${(stat.winRate * 100).toFixed(0)}% win rate · ${stat.wins}W ${stat.losses}L · ${stat.gamesPlayed} GP`
}

const streakDetail = computed(
  () => `Current: ${props.advanced.currentWinStreak}W / ${props.advanced.currentLossStreak}L`
)
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-ink">Insights</h2>

    <!-- Rating extremes + streaks -->
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label="Highest rating" :value="advanced.highestRating.toFixed(1)" tone="win" />
      <StatTile label="Lowest rating" :value="advanced.lowestRating.toFixed(1)" tone="loss" />
      <StatTile label="Best streak" :value="`${advanced.longestWinStreak}W`" :detail="streakDetail" tone="brand" />
      <StatTile label="Worst streak" :value="`${advanced.longestLossStreak}L`" />
    </div>

    <!-- Nemesis / pigeon -->
    <div
      v-if="advanced.nemesis || advanced.pigeon"
      class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-1"
    >
      <ListItem
        v-if="advanced.nemesis"
        title="Nemesis"
        :subtitle="`${advanced.nemesis.displayName} · ${statDetail(advanced.nemesis)}`"
        chevron
        @click="openPlayer(advanced.nemesis)"
      >
        <template #leading><Skull class="size-5 text-loss" /></template>
      </ListItem>
      <ListItem
        v-if="advanced.pigeon"
        title="Pigeon"
        :subtitle="`${advanced.pigeon.displayName} · ${statDetail(advanced.pigeon)}`"
        chevron
        @click="openPlayer(advanced.pigeon)"
      >
        <template #leading><Target class="size-5 text-win" /></template>
      </ListItem>
    </div>

    <!-- Teammates -->
    <div class="grid gap-3 md:grid-cols-2">
      <div class="flex flex-col gap-2">
        <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          <Flame class="size-3.5" /> Best teammates
        </h3>
        <div class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-1">
          <ListItem
            v-for="tm in advanced.bestTeammates"
            :key="tm.playerId"
            :title="tm.displayName"
            :subtitle="statDetail(tm)"
            chevron
            @click="openPlayer(tm)"
          >
            <template #leading><Avatar :name="tm.displayName" size="sm" /></template>
            <template #trailing>
              <span class="font-mono text-sm font-semibold tabular-nums text-win">
                {{ (tm.winRate * 100).toFixed(0) }}%
              </span>
            </template>
          </ListItem>
          <p v-if="advanced.bestTeammates.length === 0" class="px-4 py-4 text-center text-sm text-ink-faint">
            No data
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          <Users class="size-3.5" /> Worst teammates
        </h3>
        <div class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-1">
          <ListItem
            v-for="tm in advanced.worstTeammates"
            :key="tm.playerId"
            :title="tm.displayName"
            :subtitle="statDetail(tm)"
            chevron
            @click="openPlayer(tm)"
          >
            <template #leading><Avatar :name="tm.displayName" size="sm" /></template>
            <template #trailing>
              <span class="font-mono text-sm font-semibold tabular-nums text-loss">
                {{ (tm.winRate * 100).toFixed(0) }}%
              </span>
            </template>
          </ListItem>
          <p v-if="advanced.worstTeammates.length === 0" class="px-4 py-4 text-center text-sm text-ink-faint">
            No data
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
