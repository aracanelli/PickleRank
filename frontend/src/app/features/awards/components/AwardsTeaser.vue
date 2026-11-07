<script setup lang="ts">
/**
 * League home block: the one awards item worth a tap right now, or nothing.
 * Voting you haven't finished beats voting you have; final results beat a draft;
 * drafts show only to organizers. Load failures render nothing; the awards page has the error state.
 */
import { ref, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Trophy, ChevronRight } from 'lucide-vue-next'
import { useLeagueStore } from '@/stores/league'
import { awardsApi } from '../services/awards.api'
import type { AwardEditionDto } from '@/app/core/models/dto'

const props = defineProps<{ groupId: string }>()

const league = useLeagueStore()
const edition = ref<AwardEditionDto | null>(null)

watch(() => props.groupId, async id => {
  edition.value = null
  try {
    const e = await awardsApi.getAwards(id)
    if (id === props.groupId) edition.value = e ?? null
  } catch { /* nothing useful to show */ }
}, { immediate: true })

const item = computed(() => {
  const e = edition.value
  if (!e) return null
  const cats = e.categories
  if (e.status === 'VOTING_OPEN') {
    const left = cats.filter(c => !c.myVote).length
    if (e.canVote && left) {
      return { title: 'Awards voting is open', body: `You've voted in ${cats.length - left} of ${cats.length} categories.`, link: 'Vote now' }
    }
    return { title: 'Awards voting is open', body: e.canVote ? 'You voted in every category. Results show when voting closes.' : 'Results show when the organizer closes voting.', link: 'See awards' }
  }
  if (e.status === 'CLOSED') {
    const top = cats.find(c => c.results?.length)
    const w = top?.results?.[0]
    return { title: 'Awards results are in', body: w ? `${top!.title}: ${w.displayName}` : 'See the season awards.', link: 'See results' }
  }
  if (league.isOrganizer) {
    return { title: 'Awards are in draft', body: cats.length ? 'Open voting when your categories are ready.' : 'Add voting categories, then open voting.', link: 'Finish setup' }
  }
  return null
})
</script>

<template>
  <section v-if="item" class="section" aria-labelledby="awards-teaser-h">
    <h2 id="awards-teaser-h">Awards</h2>
    <RouterLink :to="`/groups/${groupId}/awards`" class="teaser">
      <Trophy :size="22" aria-hidden="true" class="teaser__icon" />
      <span class="teaser__text">
        <span class="teaser__title">{{ item.title }}</span>
        <span class="muted teaser__body">{{ item.body }}</span>
        <span class="teaser__link">{{ item.link }}</span>
      </span>
      <ChevronRight :size="20" aria-hidden="true" />
    </RouterLink>
  </section>
</template>

<style scoped>
.teaser {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: var(--tap);
  padding: var(--s4);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-tile);
  background: var(--surface);
  color: var(--ink);
  text-decoration: none;
}
.teaser:hover { background: var(--surface-sunk); }
.teaser svg { flex: none; }
.teaser__icon { color: var(--court); }
.teaser__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.teaser__title { font-weight: 700; }
.teaser__body { font-size: var(--text-sm); overflow-wrap: anywhere; }
.teaser__link { font-weight: 700; color: var(--court); }
</style>
