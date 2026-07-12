<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Trophy } from 'lucide-vue-next'
import type { AwardCategoryDto } from '@/app/core/models/dto'
import Avatar from '@/app/core/ui/components/Avatar.vue'

const props = defineProps<{
  category: AwardCategoryDto
  groupId: string
  /** Resolve a nominee's global playerId (avatar seed) from their group-player id. */
  resolveSeed?: (groupPlayerId: string) => string | undefined
}>()

const router = useRouter()

const results = computed(() => props.category.results ?? [])
const totalVotes = computed(() => props.category.totalVotes ?? 0)
const winner = computed(() => results.value[0] ?? null)
const maxVotes = computed(() => results.value.reduce((m, r) => Math.max(m, r.votes), 0) || 1)

function barWidth(votes: number): string {
  return `${Math.round((votes / maxVotes.value) * 100)}%`
}

function openWinner() {
  if (!winner.value) return
  router.push(`/groups/${props.groupId}/players/${winner.value.nomineeGroupPlayerId}`)
}
</script>

<template>
  <div class="flex flex-col gap-4 rounded-[14px] border border-line bg-surface-1 p-4">
    <div>
      <h3 class="text-sm font-semibold text-ink">{{ category.title }}</h3>
      <p v-if="category.description" class="mt-0.5 text-xs text-ink-muted">
        {{ category.description }}
      </p>
    </div>

    <template v-if="winner">
      <!-- Winner banner -->
      <button
        type="button"
        class="stadium-glow flex items-center gap-3 rounded-[12px] border border-line-strong bg-surface-court p-3 text-left transition-colors hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        @click="openWinner"
      >
        <Avatar
          :name="winner.displayName"
          :seed="resolveSeed?.(winner.nomineeGroupPlayerId)"
          size="lg"
          brand
        />
        <div class="min-w-0 flex-1">
          <span class="eyebrow flex items-center gap-1 text-accent-text">
            <Trophy class="size-3.5" aria-hidden="true" />
            Winner
          </span>
          <span class="block truncate text-base font-semibold text-ink">
            {{ winner.displayName }}
          </span>
        </div>
        <span class="numeral text-2xl leading-none text-accent-text">{{ winner.votes }}</span>
      </button>

      <!-- Ranked vote bars -->
      <ul class="flex flex-col gap-2">
        <li v-for="(result, i) in results" :key="result.nomineeGroupPlayerId" class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between gap-2">
            <span class="truncate text-sm text-ink">{{ result.displayName }}</span>
            <span class="numeral shrink-0 text-sm text-ink-muted">{{ result.votes }}</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              class="h-full rounded-full transition-[width]"
              :class="i === 0 ? 'bg-accent-fill' : 'bg-line-strong'"
              :style="{ width: barWidth(result.votes) }"
            />
          </div>
        </li>
      </ul>

      <p class="eyebrow text-ink-faint">
        {{ totalVotes }} {{ totalVotes === 1 ? 'vote' : 'votes' }} cast
      </p>
    </template>

    <p v-else class="text-sm text-ink-faint">No votes were cast in this category.</p>
  </div>
</template>
