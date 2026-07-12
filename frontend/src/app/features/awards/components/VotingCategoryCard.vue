<script setup lang="ts">
import { computed } from 'vue'
import { Check, ChevronRight, Lock } from 'lucide-vue-next'
import type { AwardCategoryDto } from '@/app/core/models/dto'

const props = defineProps<{
  category: AwardCategoryDto
  /** Name of the caller's current pick, if any (resolved by the parent). */
  myVoteName?: string | null
  /** Whether the caller can vote (has a linked player). */
  canVote: boolean
}>()

const emit = defineEmits<{ voteClick: [] }>()

const hasVoted = computed(() => !!props.category.myVote && !!props.myVoteName)

function onClick() {
  if (!props.canVote) return
  emit('voteClick')
}
</script>

<template>
  <component
    :is="canVote ? 'button' : 'div'"
    :type="canVote ? 'button' : undefined"
    class="flex w-full items-center gap-3 rounded-[14px] border border-line bg-surface-1 p-4 text-left transition-colors"
    :class="
      canVote
        ? 'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
        : 'opacity-70'
    "
    @click="onClick"
  >
    <div class="min-w-0 flex-1">
      <h3 class="text-sm font-semibold text-ink">{{ category.title }}</h3>
      <p v-if="category.description" class="mt-0.5 text-xs text-ink-muted">
        {{ category.description }}
      </p>
      <p
        v-if="!canVote"
        class="mt-2 inline-flex items-center gap-1 text-xs text-ink-faint"
      >
        <Lock class="size-3.5" aria-hidden="true" />
        Voting locked
      </p>
      <p
        v-else-if="hasVoted"
        class="mt-2 inline-flex items-center gap-1 text-xs text-accent-text"
      >
        <Check class="size-3.5" aria-hidden="true" />
        You picked {{ myVoteName }} · Tap to change
      </p>
      <p v-else class="mt-2 text-xs font-medium text-accent-text">Tap to vote</p>
    </div>
    <ChevronRight v-if="canVote" class="size-5 shrink-0 text-ink-faint" aria-hidden="true" />
  </component>
</template>
