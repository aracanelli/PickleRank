<script setup lang="ts">
/** A finished night's box score: player of the night up top, then the night's superlatives. */
import { computed, nextTick, ref, type Component } from 'vue'
import { BadgeCheck, Zap, HeartPulse, Donut, Users, Flame, Share2 } from 'lucide-vue-next'
import type { EventDto, RatingUpdateDto } from '@/app/core/models/dto'
import PlayerAvatar from '@/app/core/ui/PlayerAvatar.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import { toast } from '@/app/core/ui/feedback'
import { shareElementAsImage, safeFileName } from '@/app/core/ui/shareImage'
import { eventTitle } from '../eventProgress'
import { nightSuperlatives, recapLines, fmtDelta, type RecapKey } from '../utils/superlatives'
import ShareableRecap from './ShareableRecap.vue'

const props = defineProps<{ event: EventDto; updates?: RatingUpdateDto[] }>()

const sup = computed(() => nightSuperlatives(props.event, props.updates))
const lines = computed(() => recapLines(sup.value))
const icons: Record<RecapKey, Component> = { perfect: BadgeCheck, upset: Zap, nailBiter: HeartPulse, bagel: Donut, duo: Users, ironCourt: Flame }

const mvpLine = computed(() => {
  const m = sup.value.mvp
  if (!m) return ''
  const rec = `${m.wins} ${m.wins === 1 ? 'win' : 'wins'} from ${m.games}`
  return m.delta != null ? `Player of the night. Biggest rating gain, ${rec}.` : `Player of the night, ${rec}.`
})
const mvpBig = computed(() => {
  const m = sup.value.mvp
  if (!m) return ''
  return m.delta != null ? fmtDelta(m.delta) : `${m.wins} ${m.wins === 1 ? 'win' : 'wins'}`
})

const sharing = ref(false)
const shareEl = ref<HTMLElement | null>(null)
async function share() {
  sharing.value = true
  try {
    await nextTick()
    const el = shareEl.value?.firstElementChild as HTMLElement | null
    if (el) await shareElementAsImage(el, `${safeFileName(eventTitle(props.event))}-recap.png`)
  } catch {
    toast('Image not created', 'bad')
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <section v-if="sup.mvp || lines.length" class="recap" aria-labelledby="recap-h">
    <div class="recap__head">
      <h2 id="recap-h">Night recap</h2>
      <UiButton :loading="sharing" @click="share"><Share2 :size="18" aria-hidden="true" /> Share recap</UiButton>
    </div>

    <div v-if="sup.mvp" class="mvp">
      <PlayerAvatar :name="sup.mvp.player.displayName" size="xl" :medal="1" />
      <div class="mvp__text">
        <h3 class="mvp__name">{{ sup.mvp.player.displayName }}</h3>
        <p class="mvp__line">{{ mvpLine }}</p>
        <p class="mvp__big num">{{ mvpBig }}</p>
      </div>
    </div>

    <ul v-if="lines.length" role="list" class="sups">
      <li v-for="l in lines" :key="l.key" class="sup">
        <span class="sup__icon" aria-hidden="true"><component :is="icons[l.key]" :size="20" /></span>
        <div class="sup__text">
          <h3 class="sup__title">{{ l.title }}</h3>
          <p>{{ l.line }}</p>
          <p v-if="l.score" class="sup__score"><span class="num">{{ l.score }}</span> <span class="muted">{{ l.where }}</span></p>
        </div>
      </li>
    </ul>

    <div ref="shareEl" class="offscreen" aria-hidden="true">
      <ShareableRecap v-if="sharing" :title="eventTitle(event)" :mvp="sup.mvp" :mvp-line="mvpLine" :mvp-big="mvpBig" :lines="lines" />
    </div>
  </section>
</template>

<style scoped>
.recap { display: flex; flex-direction: column; gap: var(--s3); }
.recap__head { display: flex; align-items: center; justify-content: space-between; gap: var(--s2); flex-wrap: wrap; }

.mvp {
  display: flex;
  align-items: center;
  gap: var(--s4);
  padding: var(--s4);
  border-radius: var(--r-tile);
  background: var(--court-tint);
}
.mvp :deep(.avatar) { margin: 6px; }
.mvp__text { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: var(--s1); }
.mvp__name { font-size: var(--text-xl); line-height: 1.1; overflow-wrap: anywhere; }
.mvp__line { font-size: var(--text-sm); color: var(--ink-2); }
.mvp__big {
  font-size: var(--num-lg);
  line-height: 1;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: var(--r-control);
  background: var(--optic);
  color: var(--on-optic);
}

.sups { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sup { display: flex; gap: var(--s3); padding: var(--s3) 0; border-bottom: 1px solid var(--line); }
.sup:last-child { border-bottom: 0; }
.sup__icon {
  flex: none;
  width: 40px; height: 40px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: var(--surface-sunk);
  color: var(--court);
}
.sup__text { min-width: 0; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
.sup__title { font-size: var(--text-md); }
.sup__score { display: flex; align-items: baseline; gap: var(--s2); font-size: var(--text-sm); }
.sup__score .num { font-size: var(--text-lg); font-weight: 700; }

.offscreen { position: fixed; left: -10000px; top: 0; }
</style>
