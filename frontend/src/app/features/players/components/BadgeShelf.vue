<script setup lang="ts">
/**
 * Badge shelf: earned medallions in colour, locked ones muted with progress in
 * text. Tapping one opens a sheet with how it's earned and when.
 */
import { computed, ref } from 'vue'
import { Donut, Moon, Swords, Timer, Flame, CalendarCheck, Shield, Medal, Trophy, Mountain, Users, Lock } from 'lucide-vue-next'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import type { Badge, BadgeId } from '../utils/badges'

const props = defineProps<{ badges: Badge[] }>()

const ICON: Record<BadgeId, typeof Donut> = {
  bagel: Donut, 'perfect-night': Moon, 'giant-killer': Swords, clutch: Timer, 'hot-hand': Flame,
  regular: CalendarCheck, 'iron-court': Shield, 'half-century': Medal, century: Trophy, peak: Mountain, social: Users
}

// earned first, then the closest to unlocking
const sorted = computed(() => [...props.badges].sort((a, b) =>
  Number(b.earned) - Number(a.earned) || ratio(b) - ratio(a)))
const ratio = (b: Badge) => (b.progress ? b.progress.current / b.progress.target : 0)
const earnedCount = computed(() => props.badges.filter(b => b.earned).length)
// a stable colour per badge so the shelf reads like a pin collection
const ORDER = Object.keys(ICON)
const colour = (b: Badge) => `var(--jersey-${(ORDER.indexOf(b.id) % 8) + 1})`

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const progressText = (b: Badge) => (b.progress ? `${b.progress.current} of ${b.progress.target} ${b.progress.unit}` : '')
function status(b: Badge) {
  if (b.earned) return b.earnedAt ? `Earned ${date(b.earnedAt)}` : 'Earned'
  return b.progress ? `Locked, ${progressText(b)}` : 'Locked'
}

const open = ref<Badge | null>(null)
</script>

<template>
  <section class="section" aria-labelledby="badges-h">
    <div class="section-head">
      <h2 id="badges-h">Badges</h2>
      <span class="muted small"><span class="num">{{ earnedCount }}</span> of <span class="num">{{ badges.length }}</span> earned</span>
    </div>
    <ul role="list" class="shelf">
      <li v-for="b in sorted" :key="b.id">
        <button type="button" class="badge" :class="{ 'badge--locked': !b.earned }" @click="open = b">
          <span class="medal" :style="b.earned ? { '--pin': colour(b) } : undefined" aria-hidden="true">
            <component :is="ICON[b.id]" :size="26" :stroke-width="2.25" />
            <span v-if="!b.earned" class="medal__lock"><Lock :size="12" :stroke-width="2.5" /></span>
          </span>
          <span class="badge__name">{{ b.name }}</span>
          <span class="badge__status">{{ b.earned ? 'Earned' : 'Locked' }}</span>
          <span v-if="!b.earned && b.progress" class="badge__bar" aria-hidden="true">
            <span :style="{ width: `${ratio(b) * 100}%` }" />
          </span>
          <span v-if="!b.earned && b.progress" class="badge__prog num">{{ b.progress.current }} of {{ b.progress.target }}</span>
        </button>
      </li>
    </ul>

    <UiSheet :open="!!open" :title="open?.name ?? 'Badge'" @close="open = null">
      <div v-if="open" class="detail">
        <span class="medal medal--lg" :class="{ 'medal--off': !open.earned }" :style="open.earned ? { '--pin': colour(open) } : undefined" aria-hidden="true">
          <component :is="ICON[open.id]" :size="36" :stroke-width="2.25" />
        </span>
        <p>{{ open.description }}</p>
        <p class="detail__status">{{ status(open) }}</p>
      </div>
    </UiSheet>
  </section>
</template>

<style scoped>
.small { font-size: var(--text-sm); }
.shelf {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: var(--s2);
  margin: 0;
}
.badge {
  width: 100%;
  min-height: var(--tap);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--s3) var(--s1);
  border: 1px solid var(--line);
  border-radius: var(--r-tile);
  background: var(--surface);
  color: var(--ink);
  text-align: center;
}
.badge:hover { border-color: var(--line-strong); }
.badge--locked { background: transparent; border-style: dashed; }

.medal {
  position: relative;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  margin-bottom: var(--s1);
  border-radius: 50%;
  background: var(--pin, var(--surface-sunk));
  color: #fff;
  box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px var(--medal-1);
}
.badge--locked .medal, .medal--off {
  background: var(--surface-sunk);
  color: var(--ink-2);
  box-shadow: inset 0 0 0 2px var(--line);
}
.medal__lock {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink-2);
  box-shadow: inset 0 0 0 1.5px var(--line-strong);
}
.badge__name { font-weight: 700; font-size: var(--text-sm); line-height: 1.2; }
.badge__status { font-size: var(--text-xs); color: var(--ink-2); }
.badge__bar {
  width: 60%;
  height: 4px;
  margin-top: 2px;
  border-radius: 2px;
  background: var(--surface-sunk);
  box-shadow: inset 0 0 0 1px var(--line);
  overflow: hidden;
}
.badge__bar > span { display: block; height: 100%; background: var(--ink-2); }
.badge__prog { font-size: var(--text-sm); color: var(--ink-2); }

.detail { display: flex; flex-direction: column; align-items: center; gap: var(--s3); text-align: center; padding-bottom: var(--s2); }
.medal--lg { width: 76px; height: 76px; }
.detail__status { font-weight: 700; }
</style>
