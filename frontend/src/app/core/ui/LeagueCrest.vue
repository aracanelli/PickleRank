<script setup lang="ts">
/**
 * A league's logo: its initials painted on a court seen from above, in a colour fixed by the league name.
 * Square, so it never reads as a player's round jersey. Decorative: the name is always printed beside it.
 */
import { computed } from 'vue'
import { jerseyFor, initialsOf } from './jersey'
import { useImage, leagueLogoPath } from './photo'

const props = withDefaults(defineProps<{
  name: string
  size?: 'md' | 'lg'
  /** the league (anything with id and logoVersion); shows its uploaded logo when it has one */
  logo?: { id: string; logoVersion?: number | null } | null
}>(), { size: 'md', logo: null })

const colour = computed(() => `var(--jersey-${jerseyFor(props.name)})`)
const initials = computed(() => initialsOf(props.name))
const src = useImage(() => props.logo ? { path: leagueLogoPath(props.logo.id), version: props.logo.logoVersion } : null)
</script>

<template>
  <span v-if="src" class="crest crest--photo" :class="`crest--${size}`" aria-hidden="true"><img class="crest__img" :src="src" alt=""></span>
  <span v-else class="crest num" :class="`crest--${size}`" :style="{ '--crest': colour }" aria-hidden="true">
    <svg class="crest__lines" viewBox="0 0 40 40" focusable="false">
      <!-- court outline, net, and both kitchen lines -->
      <rect x="5" y="5" width="30" height="30" rx="1" />
      <line x1="5" y1="20" x2="35" y2="20" class="crest__net" />
      <line x1="5" y1="14" x2="35" y2="14" />
      <line x1="5" y1="26" x2="35" y2="26" />
      <line x1="20" y1="5" x2="20" y2="14" />
      <line x1="20" y1="26" x2="20" y2="35" />
    </svg>
    <span class="crest__txt">{{ initials }}</span>
  </span>
</template>

<style scoped>
.crest {
  --size: 52px;
  position: relative;
  flex: none;
  display: inline-grid;
  place-items: center;
  width: var(--size);
  height: var(--size);
  border-radius: 10px;
  background: var(--crest);
  color: #fff;
  overflow: hidden;
}
.crest--lg { --size: 72px; border-radius: 14px; }
.crest--photo { background: var(--surface-sunk); }
.crest__img { width: 100%; height: 100%; object-fit: cover; }
.crest__lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: none;
  stroke: rgb(255 255 255 / 0.28);
  stroke-width: 1.2;
}
.crest__net { stroke: rgb(255 255 255 / 0.5); stroke-width: 1.6; }
.crest__txt {
  position: relative;
  font-weight: 700;
  font-size: calc(var(--size) * 0.44);
  line-height: 1;
  letter-spacing: 0.02em;
  /* initials sit on the court like a painted marking; the shadow keeps them clear of the lines */
  text-shadow: 0 0 6px var(--crest), 0 0 2px var(--crest);
}
</style>
