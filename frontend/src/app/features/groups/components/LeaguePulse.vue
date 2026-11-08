<script setup lang="ts">
/**
 * "League pulse" on league home: streaks, a rivalry, the best pair, milestones and the closest recent game,
 * all derived from the 30-day history the page already loads. Hidden when nothing qualifies.
 */
import { computed, type Component } from 'vue'
import { RouterLink } from 'vue-router'
import { Flame, Snowflake, Swords, Handshake, Milestone, ChevronRight } from 'lucide-vue-next'
import type { MatchHistoryEntryDto, RankingEntryDto, GroupPlayerDto } from '@/app/core/models/dto'
import { hotAndCold } from '@/app/features/rankings/utils/match-derivations'
import { rivalry, dynamicDuo, milestones } from '../utils/pulse'

const props = defineProps<{
  groupId: string
  matches: MatchHistoryEntryDto[]
  rankings: RankingEntryDto[]
  players: Pick<GroupPlayerDto, 'id' | 'playerId' | 'displayName'>[]
}>()

interface Moment { key: string; icon: Component; tone?: 'hot' | 'cold'; title: string; sub: string; to?: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const moments = computed<Moment[]>(() => {
  const byGp = new Map(props.players.map(p => [p.id, p]))
  const name = (gpId: string) => byGp.get(gpId)?.displayName ?? 'Someone'
  const profile = (gpId: string) => `/groups/${props.groupId}/players/${gpId}`
  const out: Moment[] = []

  const { hot, cold } = hotAndCold(props.matches, new Map(props.players.map(p => [p.id, p.displayName])))
  if (hot) out.push({ key: 'hot', icon: Flame, tone: 'hot', title: `${hot.displayName} has won ${hot.length} straight`, sub: 'Hottest streak in the league', to: profile(hot.groupPlayerId) })

  const rival = rivalry(props.matches)
  if (rival) {
    const a = byGp.get(rival.a)?.playerId, b = byGp.get(rival.b)?.playerId
    const record = `${rival.aWins}–${rival.bWins}${rival.ties ? `–${rival.ties}` : ''}`
    out.push({
      key: 'rival', icon: Swords,
      title: `${name(rival.a)} vs ${name(rival.b)}`,
      sub: `${record} in ${plural(rival.meetings, 'meeting')}. ${rival.aWins === rival.bWins ? 'Dead even.' : 'Too close to call.'}`,
      to: a && b ? `/groups/${props.groupId}/history?h2h=${a},${b}` : undefined
    })
  }

  const duo = dynamicDuo(props.matches)
  if (duo) out.push({ key: 'duo', icon: Handshake, title: `${name(duo.a)} and ${name(duo.b)}`, sub: `Won ${duo.wins} of ${duo.games} together. Best pair going.` })

  for (const m of milestones(props.rankings)) {
    const gp = props.players.find(p => p.playerId === m.playerId)
    out.push({
      key: `ms-${m.playerId}`, icon: Milestone,
      title: m.toGo ? `${m.name} is ${plural(m.toGo, 'game')} from ${m.target}` : `${m.name} has played ${m.target} games`,
      sub: m.toGo ? 'Milestone in sight' : 'A round number. Nice.',
      to: gp ? profile(gp.id) : undefined
    })
  }

  if (cold) out.push({ key: 'cold', icon: Snowflake, tone: 'cold', title: `${cold.displayName} has dropped ${cold.length} in a row`, sub: 'Due a bounce-back', to: profile(cold.groupPlayerId) })
  return out
})
</script>

<template>
  <section v-if="moments.length" class="section" aria-labelledby="pulse-h">
    <h2 id="pulse-h">League pulse</h2>
    <ul role="list" class="pulse">
      <li v-for="m in moments" :key="m.key">
        <component :is="m.to ? RouterLink : 'div'" :to="m.to" class="moment">
          <span class="moment__icon" :class="m.tone && `moment__icon--${m.tone}`" aria-hidden="true">
            <component :is="m.icon" :size="20" />
          </span>
          <span class="moment__text">
            <span class="moment__title">{{ m.title }}</span>
            <span class="moment__sub muted">{{ m.sub }}</span>
          </span>
          <ChevronRight v-if="m.to" :size="18" class="moment__chev" aria-hidden="true" />
        </component>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.pulse { display: flex; flex-direction: column; }
.pulse li { border-bottom: 1px solid var(--line); }
.moment {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: 64px;
  padding: var(--s2) 0;
  color: var(--ink);
  text-decoration: none;
}
.moment__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--r-control);
  background: var(--court-tint);
  color: var(--court);
}
.moment__icon--hot { background: var(--bad-tint); color: var(--bad); }
.moment__icon--cold { background: var(--surface-sunk); color: var(--ink-2); }
.moment__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.moment__title { font-weight: 700; overflow-wrap: anywhere; }
.moment__sub { font-size: var(--text-sm); }
.moment__chev { flex: none; color: var(--ink-2); }
</style>
