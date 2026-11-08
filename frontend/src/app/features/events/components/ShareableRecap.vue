<script setup lang="ts">
/**
 * Off-screen recap rendered to an image for the group chat.
 * Fixed light palette: the image leaves the app, so it must not follow the viewer's theme.
 */
import PlayerAvatar from '@/app/core/ui/PlayerAvatar.vue'
import type { NightSuperlatives, RecapLine } from '../utils/superlatives'

defineProps<{ title: string; mvp?: NightSuperlatives['mvp']; mvpLine: string; mvpBig: string; lines: RecapLine[] }>()
</script>

<template>
  <div class="share">
    <p class="brand">PickleRank</p>
    <p class="title">{{ title }}, night recap</p>
    <div v-if="mvp" class="mvp">
      <PlayerAvatar :name="mvp.player.displayName" size="xl" />
      <div>
        <p class="mvp__name">{{ mvp.player.displayName }}</p>
        <p class="muted">{{ mvpLine }}</p>
        <p class="big">{{ mvpBig }}</p>
      </div>
    </div>
    <div v-for="l in lines" :key="l.key" class="row">
      <p class="row__title">{{ l.title }}<b v-if="l.score">{{ l.score }}</b></p>
      <p>{{ l.line }}<span v-if="l.where" class="muted"> {{ l.where }}.</span></p>
    </div>
  </div>
</template>

<style scoped>
.share {
  width: 720px;
  padding: 32px;
  background: #ffffff;
  color: #13233a;
  font-family: 'Atkinson Hyperlegible Next', system-ui, sans-serif;
  font-size: 18px;
}
.brand { font-weight: 700; color: #1e5aa8; font-size: 16px; }
.title { font-size: 30px; font-weight: 700; margin: 4px 0 20px; }
.muted { color: #44546a; }
.mvp { display: flex; align-items: center; gap: 24px; padding: 20px; border-radius: 12px; background: #e6eef8; margin-bottom: 12px; }
.mvp__name { font-size: 28px; font-weight: 700; }
.big { display: inline-block; margin-top: 6px; padding: 2px 12px; border-radius: 8px; background: #ddf04a; color: #13233a; font: 700 40px 'Barlow Condensed', sans-serif; }
.row { padding: 12px 0; border-bottom: 1px solid #c9d2dd; }
.row:last-child { border-bottom: 0; }
.row__title { display: flex; justify-content: space-between; font-weight: 700; font-size: 20px; }
.row__title b { font: 700 24px 'Barlow Condensed', sans-serif; }
</style>
