<script setup lang="ts">
/**
 * League home: what happened at the league's most recent night, as a scoreboard plus a few headlines.
 * Everything is derived from the 30-day history the page already loads.
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRight, Scale, Zap } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { GroupPlayerDto } from '@/app/core/models/dto'
import type { Night } from '../utils/lastWeek'
import { nightStats } from '../utils/lastWeek'
import { formatDay } from '@/app/features/events/eventProgress'
import PlayerAvatar from '@/app/core/ui/PlayerAvatar.vue'

const props = defineProps<{
  groupId: string
  night: Night
  players: Pick<GroupPlayerDto, 'id' | 'displayName' | 'ratingDelta'>[]
}>()

const stats = computed(() => nightStats(props.night))
const profile = (gpId: string) => `/groups/${props.groupId}/players/${gpId}`
const record = (w: number, l: number, t: number) => `${w}–${l}${t ? `–${t}` : ''}`
const team = (names: string[]) => names.join(' & ')

/** biggest rating gain from the last completed event, as the roster reports it */
const climber = computed(() => {
  const best = [...props.players].filter(p => (p.ratingDelta ?? 0) > 0).sort((a, b) => (b.ratingDelta ?? 0) - (a.ratingDelta ?? 0))[0]
  return best ? { id: best.id, name: best.displayName, delta: Math.round(best.ratingDelta!) } : null
})

interface Headline { key: string; name?: string; icon?: Component; title: string; sub: string; to?: string }
const headlines = computed<Headline[]>(() => {
  const s = stats.value
  if (!s) return []
  const out: Headline[] = []
  if (s.mvp) {
    out.push({ key: 'mvp', name: s.mvp.name, title: `${s.mvp.name} went ${record(s.mvp.wins, s.mvp.losses, s.mvp.ties)}`, sub: `Player of the night, ${s.mvp.pointDiff > 0 ? '+' : ''}${s.mvp.pointDiff} points`, to: profile(s.mvp.id) })
  }
  if (climber.value && climber.value.name !== s.mvp?.name) {
    out.push({ key: 'climb', name: climber.value.name, title: `${climber.value.name} climbed ${climber.value.delta} points`, sub: 'Biggest rating gain', to: profile(climber.value.id) })
  }
  const perfect = s.perfect.filter(p => p.id !== s.mvp?.id)
  if (perfect.length) {
    const p = perfect[0]
    out.push({ key: 'perfect', name: p.name, title: `${p.name} didn't drop a game`, sub: perfect.length > 1 ? `And ${perfect.length - 1} more perfect nights` : 'Perfect night', to: profile(p.id) })
  }
  if (s.closest) {
    const m = s.closest
    out.push({ key: 'close', icon: Scale, title: `${m.scoreTeam1}–${m.scoreTeam2} on court ${m.courtIndex + 1}`, sub: `Closest game: ${team(m.team1)} against ${team(m.team2)}` })
  }
  if (s.blowout) {
    const m = s.blowout
    const w = m.scoreTeam1! > m.scoreTeam2! ? m.team1 : m.team2
    out.push({ key: 'blowout', icon: Zap, title: `${Math.max(m.scoreTeam1!, m.scoreTeam2!)}–${Math.min(m.scoreTeam1!, m.scoreTeam2!)} for ${team(w)}`, sub: 'Biggest win of the night' })
  }
  return out.slice(0, 4)
})
</script>

<template>
  <section v-if="stats" class="section" aria-labelledby="lastweek-h">
    <div class="section-head">
      <h2 id="lastweek-h">Last event</h2>
      <RouterLink :to="`/events/${night.eventId}`" class="more">Every game</RouterLink>
    </div>

    <div class="board">
      <p class="board__when">{{ night.eventName || 'League night' }}, {{ formatDay(night.date) }}</p>
      <dl class="board__nums">
        <div><dt>Games</dt><dd class="num">{{ stats.games }}</dd></div>
        <div><dt>Players</dt><dd class="num">{{ stats.players }}</dd></div>
        <div><dt>Within 2</dt><dd class="num">{{ stats.nailBiters }}</dd></div>
        <div><dt>Points</dt><dd class="num">{{ stats.points }}</dd></div>
      </dl>
    </div>

    <ul role="list" class="heads">
      <li v-for="h in headlines" :key="h.key">
        <component :is="h.to ? RouterLink : 'div'" :to="h.to" class="head">
          <PlayerAvatar v-if="h.name" :name="h.name" size="sm" />
          <span v-else class="head__icon"><component :is="h.icon" :size="16" aria-hidden="true" /></span>
          <span class="head__text">
            <span class="head__title">{{ h.title }}</span>
            <span class="head__sub">{{ h.sub }}</span>
          </span>
          <ChevronRight v-if="h.to" :size="18" aria-hidden="true" class="head__go" />
        </component>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.more { display: inline-flex; align-items: center; min-height: var(--tap); font-weight: 700; text-decoration: none; }

/* a court-side scoreboard: four numbers, read at a glance */
.board {
  padding: var(--s3) var(--s4) var(--s4);
  border: 1px solid var(--line);
  border-radius: var(--r-tile);
  background: var(--surface);
  color: var(--ink);
}
.board__when { margin: 0 0 var(--s2); font-size: var(--text-sm); font-weight: 700; }
.board__nums { display: grid; grid-template-columns: repeat(auto-fit, minmax(3.75rem, 1fr)); gap: var(--s2); margin: 0; }
.board__nums div { display: flex; flex-direction: column-reverse; }
.board__nums dt { font-size: var(--text-xs); font-weight: 700; color: var(--ink-2); }
.board__nums dd { margin: 0; font-size: 2.25rem; line-height: 1; color: var(--ink); }

.heads { display: flex; flex-direction: column; }
.head {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: 56px;
  padding: var(--s2) 0;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  text-decoration: none;
}
.head__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--surface-sunk);
  color: var(--ink-2);
}
.head__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.head__title { font-weight: 700; }
.head__sub { font-size: var(--text-sm); color: var(--ink-2); }
.head__go { flex: none; color: var(--ink-2); }
</style>
