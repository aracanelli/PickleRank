<script setup lang="ts">
/**
 * League home, for anyone linked to a player here: how you did at the league's last event, where you stand,
 * who you're chasing and what's next for you. The personal half of the dashboard.
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Target, Handshake, Milestone, ChevronRight } from 'lucide-vue-next'
import type { GroupPlayerDto } from '@/app/core/models/dto'
import type { MyNight, Chase } from '../utils/lastWeek'
import { MILESTONES } from '../utils/pulse'
import PlayerAvatar from '@/app/core/ui/PlayerAvatar.vue'

const props = defineProps<{
  groupId: string
  me: GroupPlayerDto
  rank: number | null
  rankChange: number
  week: MyNight | null
  chase: Chase | null
  /** the league's last event with scores, or null before the first one */
  eventName: string | null
}>()

const word = { W: 'won', L: 'lost', T: 'tied' } as const
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th'}`
const firstName = computed(() => props.me.displayName.trim().split(/\s+/)[0])
const delta = computed(() => Math.round(props.me.ratingDelta ?? 0))
const nextMilestone = computed(() => {
  const target = MILESTONES.find(t => t > props.me.gamesPlayed)
  return target ? { target, toGo: target - props.me.gamesPlayed } : null
})

const verdict = computed(() => {
  const w = props.week
  if (!w) return props.eventName ? `You missed ${props.eventName}.` : 'No events played yet.'
  if (w.wins && !w.losses && !w.ties) return 'A perfect night.'
  if (w.wins > w.losses) return 'A winning night.'
  if (w.wins === w.losses) return 'Even night.'
  return 'A tough night.'
})
</script>

<template>
  <section class="section" aria-labelledby="you-h">
    <h2 id="you-h" class="visually-hidden">Your week</h2>
    <RouterLink :to="`/groups/${groupId}/players/${me.id}`" class="you">
      <PlayerAvatar :name="me.displayName" size="lg" />
      <span class="you__main">
        <span class="you__hi">{{ firstName }}, {{ verdict.charAt(0).toLowerCase() + verdict.slice(1) }}</span>
        <span v-if="week" class="you__rec">
          <span class="num you__score">{{ week.wins }}–{{ week.losses }}<template v-if="week.ties">–{{ week.ties }}</template></span>
          <span class="you__dots">
            <span class="visually-hidden">{{ eventName }}: {{ week.form.map(f => word[f]).join(', ') }}</span>
            <span v-for="(f, i) in week.form" :key="i" class="dot" :class="`dot--${f}`" aria-hidden="true" />
          </span>
        </span>
      </span>
      <ChevronRight :size="20" aria-hidden="true" class="you__go" />
    </RouterLink>

    <!-- where you stand, said as a sentence rather than a row of stat tiles -->
    <p class="stand">
      <template v-if="rank">
        <b class="num">{{ ordinal(rank) }}</b> in the league<template v-if="rankChange">, <span :class="rankChange > 0 ? 'up' : 'down'">{{ rankChange > 0 ? 'up' : 'down' }} {{ Math.abs(rankChange) }}</span></template>.
      </template>
      Rating <b class="num">{{ Math.round(me.rating) }}</b><template v-if="delta">, <span :class="delta > 0 ? 'up' : 'down'">{{ delta > 0 ? 'up' : 'down' }} {{ Math.abs(delta) }}</span></template>.
      You win <b class="num">{{ Math.round(me.winRate * 100) }}%</b> of your games.
    </p>

    <ul role="list" class="notes">
      <li v-if="chase" class="note">
        <Target :size="18" aria-hidden="true" />
        <span v-if="chase.leading">You're #1, {{ chase.points }} {{ chase.points === 1 ? 'point' : 'points' }} ahead of {{ chase.name }}.</span>
        <span v-else>{{ chase.points }} {{ chase.points === 1 ? 'point' : 'points' }} behind {{ chase.name }} for #{{ chase.rank }}.</span>
      </li>
      <li v-if="week?.bestPartner" class="note">
        <Handshake :size="18" aria-hidden="true" />
        <span>Best with {{ week.bestPartner.name }}: {{ week.bestPartner.wins }} of {{ week.bestPartner.games }} won together.</span>
      </li>
      <li v-if="nextMilestone && nextMilestone.toGo <= 5" class="note">
        <Milestone :size="18" aria-hidden="true" />
        <span>{{ nextMilestone.toGo }} {{ nextMilestone.toGo === 1 ? 'game' : 'games' }} to your {{ nextMilestone.target }}th.</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.you {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s3) var(--s3) var(--s4);
  border-radius: var(--r-tile);
  background: var(--court-tint);
  color: var(--ink);
  text-decoration: none;
}
.you__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.you__hi { font-weight: 700; }
.you__rec { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s3); }
.you__score { font-size: 2rem; line-height: 1; }
.you__dots { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.you__go { flex: none; color: var(--ink-2); }
/* same shapes as standings rows: filled won, ring lost, bar tied */
.dot { width: 12px; height: 12px; border-radius: 50%; }
.dot--W { background: var(--ok); }
.dot--L { box-shadow: inset 0 0 0 2px var(--bad); }
.dot--T { height: 4px; border-radius: 2px; background: var(--ink-2); align-self: center; }

.stand { margin: 0; line-height: 1.5; }
.stand b { font-size: var(--text-lg); }
.up { color: var(--ok); }
.down { color: var(--bad); }

.notes { display: flex; flex-direction: column; gap: var(--s2); }
.note { display: flex; align-items: flex-start; gap: var(--s2); font-size: var(--text-sm); }
.note svg { flex: none; margin-top: 2px; color: var(--court); }
</style>
