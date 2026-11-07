<script setup lang="ts">
/** A voting category row. A button when the caller can vote; plain text otherwise. */
import { Check, ChevronRight } from 'lucide-vue-next'
import type { AwardCategoryDto } from '@/app/core/models/dto'

defineProps<{
  category: AwardCategoryDto
  /** Name of the caller's current pick, resolved by the parent. */
  myVoteName?: string | null
  /** Whether the caller can vote (voting open and a linked player). */
  canVote: boolean
}>()

const emit = defineEmits<{ voteClick: [] }>()
</script>

<template>
  <button v-if="canVote" type="button" class="cat cat--btn" @click="emit('voteClick')">
    <span class="cat__text">
      <span class="cat__title">{{ category.title }}</span>
      <span v-if="category.description" class="muted cat__desc">{{ category.description }}</span>
      <span v-if="myVoteName" class="cat__vote">
        <Check :size="16" aria-hidden="true" />Your vote: {{ myVoteName }}
      </span>
      <span v-else class="cat__vote cat__vote--todo">Not voted yet</span>
    </span>
    <ChevronRight :size="20" aria-hidden="true" class="cat__chev" />
  </button>
  <div v-else class="cat">
    <span class="cat__text">
      <span class="cat__title">{{ category.title }}</span>
      <span v-if="category.description" class="muted cat__desc">{{ category.description }}</span>
    </span>
  </div>
</template>

<style scoped>
.cat {
  display: flex;
  align-items: center;
  gap: var(--s3);
  width: 100%;
  min-height: 64px;
  padding: var(--s3) 0;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  text-align: left;
}
.cat--btn:hover { background: var(--surface-sunk); }
.cat__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cat__title { font-weight: 700; overflow-wrap: anywhere; }
.cat__desc { font-size: var(--text-sm); }
.cat__vote { display: inline-flex; align-items: center; gap: var(--s1); font-size: var(--text-sm); font-weight: 700; color: var(--ok); overflow-wrap: anywhere; }
.cat__vote svg { flex: none; }
.cat__vote--todo { color: var(--court); }
.cat__chev { flex: none; color: var(--ink-2); }
</style>
