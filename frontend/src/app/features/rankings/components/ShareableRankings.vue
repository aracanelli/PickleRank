<script setup lang="ts">
/**
 * Off-screen rankings layout rendered to an image for the group chat.
 * Fixed light palette: the image leaves the app, so it must not follow the viewer's theme.
 */
import type { RankingRow } from '../rankingsView'
import { ratingSystemLabel, winRatePct } from '../rankingsView'

const props = defineProps<{ rows: RankingRow[]; groupName: string; ratingSystem?: string }>()
// top 20 keeps the image readable in a chat preview
const top = props.rows.slice(0, 20)
const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
</script>

<template>
  <div class="share">
    <header>
      <p class="brand">PickleRank</p>
      <h1>{{ groupName }}</h1>
      <p class="meta">{{ ratingSystemLabel(ratingSystem) }} ratings on {{ today }}</p>
    </header>
    <table>
      <thead>
        <tr><th class="r">Rank</th><th>Player</th><th class="r">Rating</th><th class="r">W-L-T</th><th class="r">Win rate</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in top" :key="row.entry.playerId" :class="{ top: row.rank <= 3 }">
          <td class="r n">{{ row.rank }}</td>
          <td class="name">{{ row.entry.displayName }}<span v-if="row.sub" class="sub"> sub</span></td>
          <td class="r n">{{ row.entry.rating.toFixed(1) }}</td>
          <td class="r n">{{ row.entry.wins }}-{{ row.entry.losses }}-{{ row.entry.ties }}</td>
          <td class="r n">{{ winRatePct(row.entry.winRate) }}</td>
        </tr>
      </tbody>
    </table>
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
table { width: 100%; border-collapse: collapse; }
th { font-size: 14px; color: #44546a; text-align: left; padding: 6px 8px; border-bottom: 2px solid #13233a; }
td { padding: 8px; border-bottom: 1px solid #d5dde8; font-size: 17px; }
.r { text-align: right; }
.n { font: 600 22px 'Barlow Condensed', sans-serif; font-variant-numeric: tabular-nums; }
.top td { background: #e6eef8; }
.top .n:first-child { font-weight: 700; color: #1e5aa8; }
.name { font-weight: 700; }
.sub { font-weight: 400; color: #44546a; font-size: 14px; }
</style>
