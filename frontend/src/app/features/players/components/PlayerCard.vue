<script setup lang="ts">
/**
 * The profile hero: a collectible player card painted like a court in the
 * player's jersey colour. Holds the page h1. White text passes on every jersey.
 */
import { computed } from 'vue'
import PlayerAvatar from '@/app/core/ui/PlayerAvatar.vue'
import { jerseyFor } from '@/app/core/ui/jersey'
import type { GroupPlayerDto } from '@/app/core/models/dto'
import type { Outcome } from '@/app/features/rankings/utils/match-derivations'
import type { PlayerTitle } from '../utils/badges'

const props = defineProps<{
  player: GroupPlayerDto
  rank?: number
  subtitle: string
  title: PlayerTitle
  form: Outcome[]
}>()

const jersey = computed(() => `var(--jersey-${jerseyFor(props.player.displayName)})`)
const FORM_WORD = { W: 'won', L: 'lost', T: 'tied' } as const
const formLabel = computed(() => `Last week, ${props.form.length} ${props.form.length === 1 ? 'game' : 'games'} in order played: ${props.form.map(o => FORM_WORD[o]).join(', ')}`)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
</script>

<template>
  <div class="pcard" :style="{ '--card': jersey }">
    <div class="pcard__lines" aria-hidden="true" />

    <div class="pcard__top">
      <span class="pcard__photo"><PlayerAvatar :name="player.displayName" size="xl" :photo="player" /></span>
      <span v-if="rank" class="pcard__rank num"><span class="visually-hidden">Rank </span>#{{ rank }}</span>
    </div>

    <div class="pcard__id">
      <h1 class="pcard__name" :class="{ 'pcard__name--long': player.displayName.length > 20 }">{{ player.displayName }}</h1>
      <p class="pcard__sub">{{ subtitle }}</p>
    </div>

    <p class="pcard__title">
      <span class="pcard__nick">{{ title.title }}</span>
      <span class="pcard__why">{{ title.reason }}</span>
    </p>

    <div class="pcard__net" aria-hidden="true" />

    <dl class="pcard__stats">
      <div class="pcard__stat">
        <dt>Rating</dt>
        <dd class="num pcard__rating">{{ Math.round(player.rating) }}</dd>
      </div>
      <div class="pcard__stat">
        <dt>Record</dt>
        <dd class="pcard__record">
          <span><span class="num">{{ player.wins }}</span> {{ player.wins === 1 ? 'win' : 'wins' }}</span>
          <span><span class="num">{{ player.losses }}</span> {{ player.losses === 1 ? 'loss' : 'losses' }}</span>
          <span v-if="player.ties">{{ plural(player.ties, 'tie', 'ties') }}</span>
        </dd>
      </div>
    </dl>

    <div v-if="form.length" class="pcard__form" role="img" :aria-label="formLabel">
      <span aria-hidden="true">Last week</span>
      <!-- same shapes as everywhere else: filled won, ring lost, bar tied -->
      <span class="pcard__dots" aria-hidden="true">
        <span v-for="(o, i) in form" :key="i" class="dot" :class="`dot--${o}`" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.pcard {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  padding: var(--s5) var(--s4) var(--s4);
  border-radius: var(--r-sheet);
  background: var(--card);
  color: #fff;
  box-shadow: 0 10px 28px -14px rgb(0 0 0 / 0.5);
  animation: deal 420ms var(--ease);
}
@keyframes deal { from { transform: translateY(12px) rotate(-1.5deg); opacity: 0; } }

/* painted court: baseline box plus the centre service line down to the net */
.pcard__lines {
  position: absolute;
  inset: 10px;
  z-index: -1;
  border: 2px solid rgb(255 255 255 / 0.22);
  border-radius: calc(var(--r-sheet) - 8px);
}
.pcard__lines::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  height: 42%;
  border-left: 2px solid rgb(255 255 255 / 0.22);
}

.pcard__top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s3); }
.pcard__photo {
  display: grid;
  place-items: center;
  padding: 6px;
  border-radius: 50%;
  background: #fff;
}
.pcard__rank {
  display: inline-grid;
  place-items: center;
  min-width: 3.25rem;
  padding: 2px var(--s3);
  border-radius: var(--r-control);
  background: var(--optic);
  color: var(--on-optic);
  font-size: var(--text-xl);
  font-weight: 700;
  line-height: 1.2;
  transform: rotate(3deg);
}

.pcard__id { display: flex; flex-direction: column; gap: 2px; }
.pcard__name { font-size: 2rem; line-height: 1.1; overflow-wrap: anywhere; hyphens: auto; }
.pcard__name--long { font-size: var(--text-lg); }
.pcard__sub { font-size: var(--text-sm); }

.pcard__title { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1) var(--s2); }
.pcard__nick {
  padding: 2px var(--s3);
  border-radius: 999px;
  background: #fff;
  color: var(--card);
  font-weight: 700;
}
.pcard__why { font-size: var(--text-sm); }

/* the net: tape on top, mesh below */
.pcard__net {
  height: 12px;
  margin-inline: calc(var(--s4) * -1);
  border-top: 3px solid #fff;
  background: repeating-linear-gradient(90deg, rgb(255 255 255 / 0.35) 0 1px, transparent 1px 8px);
}

.pcard__stats { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--s2) var(--s5); margin: 0; }
.pcard__stat { display: flex; flex-direction: column; }
.pcard__stat dt { font-size: var(--text-sm); font-weight: 700; }
.pcard__stat dd { margin: 0; }
.pcard__rating { font-size: 4rem; line-height: 0.95; font-weight: 700; }
.pcard__record { display: flex; flex-wrap: wrap; gap: 0 var(--s3); font-weight: 700; }
.pcard__record .num { font-size: var(--text-xl); }

.pcard__form { display: flex; align-items: center; gap: var(--s3); font-size: var(--text-sm); font-weight: 700; }
.pcard__dots {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--surface);
}
.dot { width: 12px; height: 12px; border-radius: 50%; }
.dot--W { background: var(--ok); }
.dot--L { box-shadow: inset 0 0 0 2px var(--bad); }
.dot--T { height: 4px; border-radius: 2px; background: var(--ink-2); align-self: center; }
</style>
