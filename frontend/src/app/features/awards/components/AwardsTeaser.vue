<script setup lang="ts">
/**
 * League home block: the one awards item worth a tap right now, or nothing.
 * Voting you haven't finished beats voting you have; final results beat a draft;
 * members see awards only once published (or while voting is open). Load failures render nothing; the awards page has the error state.
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Trophy, ChevronRight } from 'lucide-vue-next'
import { useLeagueStore } from '@/stores/league'
import type { AwardEditionDto } from '@/app/core/models/dto'

const props = defineProps<{ groupId: string; edition: AwardEditionDto | null }>()

const league = useLeagueStore()

const item = computed(() => {
  const e = props.edition
  if (!e) return null
  const cats = e.categories
  if (e.status === 'VOTING_OPEN') {
    const left = cats.filter(c => !c.myVote).length
    if (e.canVote && left) {
      return { title: 'Awards voting is open', body: `You've voted in ${cats.length - left} of ${cats.length} categories.`, link: 'Vote now' }
    }
    return { title: 'Awards voting is open', body: e.canVote ? 'You voted in every category. Results show when voting closes.' : 'Results show when the organizer closes voting.', link: 'See awards' }
  }
  // Members only get unpublished editions while voting is open (handled above).
  if (!e.publishedAt) {
    if (!league.isOrganizer) return null
    return e.status === 'CLOSED'
      ? { title: 'Awards results are ready', body: 'Only organizers can see these. Publish to share them.', link: 'Publish awards' }
      : { title: 'Awards are in draft', body: 'Only organizers can see these. Publish when ready.', link: 'Finish setup' }
  }
  if (e.status === 'CLOSED') {
    const top = cats.find(c => c.results?.length)
    const w = top?.results?.[0]
    return { title: 'Awards results are in', body: w ? `${top!.title}: ${w.displayName}` : 'See the season awards.', link: 'See results' }
  }
  return { title: 'Season awards are out', body: 'See who took the season honors.', link: 'See awards' }
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
