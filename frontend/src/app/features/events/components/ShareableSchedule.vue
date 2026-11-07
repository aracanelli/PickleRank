<script setup lang="ts">
/**
 * Off-screen layout rendered to an image for the group chat.
 * Fixed light palette: the image leaves the app, so it must not follow the viewer's theme.
 */
import type { EventDto, GameDto } from '@/app/core/models/dto'
import { eventTitle } from '../eventProgress'

defineProps<{ event: EventDto; rounds: GameDto[][] }>()
</script>

<template>
  <div class="share">
    <header>
      <p class="brand">PickleRank</p>
      <h1>{{ eventTitle(event) }}</h1>
      <p class="meta">{{ event.rounds }} rounds on {{ event.courts }} courts</p>
    </header>
    <section v-for="(games, r) in rounds" :key="r" class="round">
      <h2>Round {{ r + 1 }}</h2>
      <div class="courts">
        <div v-for="g in games" :key="g.id" class="court">
          <span class="num">{{ g.courtIndex + 1 }}</span>
          <div class="teams">
            <div class="team"><span>{{ g.team1.map(p => p.displayName).join(' & ') }}</span><b v-if="g.scoreTeam1 != null">{{ g.scoreTeam1 }}</b></div>
            <div class="net" />
            <div class="team"><span>{{ g.team2.map(p => p.displayName).join(' & ') }}</span><b v-if="g.scoreTeam2 != null">{{ g.scoreTeam2 }}</b></div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.share {
  width: 720px;
  padding: 32px;
  background: #ffffff;
  color: #13233a;
  font-family: 'Atkinson Hyperlegible Next', system-ui, sans-serif;
}
.brand { font-weight: 700; color: #1e5aa8; font-size: 16px; }
h1 { font-size: 30px; margin: 4px 0; }
.meta { color: #44546a; margin-bottom: 16px; }
.round { margin-top: 20px; }
h2 { font-size: 18px; margin-bottom: 8px; }
.courts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.court { display: grid; grid-template-columns: 44px 1fr; background: #e6eef8; border-radius: 10px; overflow: hidden; }
.num { background: #1e5aa8; color: #fff; display: grid; place-items: center; font: 700 28px 'Barlow Condensed', sans-serif; }
.teams { padding: 8px 12px; }
.team { display: flex; justify-content: space-between; gap: 8px; font-size: 15px; }
.team b { font: 700 20px 'Barlow Condensed', sans-serif; }
.net { height: 2px; margin: 6px 0; background: repeating-linear-gradient(90deg, #13233a 0 6px, transparent 6px 10px); }
</style>
