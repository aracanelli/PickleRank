<script setup lang="ts">
/**
 * A player's "jersey": initials on a colour that is always the same for that
 * player, so people learn each other's colour across screens.
 * Decorative by default (the name is always printed next to it).
 */
import { computed } from 'vue'
import { jerseyFor, initialsOf } from './jersey'
import { useImage, playerPhotoPath } from './photo'
import { useLeagueStore } from '@/stores/league'

const props = withDefaults(defineProps<{
  name: string
  /** stable key for the colour; player id preferred, falls back to name */
  seed?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** podium ring */
  medal?: 1 | 2 | 3
  /** a group player (or anything with groupId, id, photoVersion); shows their photo when they have one */
  photo?: { groupId: string; id: string; photoVersion?: number | null } | null
}>(), { size: 'md', photo: null })

const jersey = computed(() => jerseyFor(props.seed || props.name))
const initials = computed(() => initialsOf(props.name))
// Without an explicit photo, find the player by name in the open league, so every list shows photos
// without threading ids through each screen. shortcut: two players with the same name share the first's photo.
const league = useLeagueStore()
const who = computed(() => {
  if (props.photo) return props.photo
  const gp = league.groupId ? league.players.find(p => p.displayName === props.name) : undefined
  return gp ? { groupId: league.groupId as string, id: gp.id, photoVersion: gp.photoVersion } : null
})
const src = useImage(() => who.value ? { path: playerPhotoPath(who.value.groupId, who.value.id), version: who.value.photoVersion } : null)
</script>

<template>
  <span
    class="avatar num"
    :class="[`avatar--${size}`, medal ? `avatar--medal${medal}` : '']"
    :style="{ '--jersey': `var(--jersey-${jersey})` }"
    aria-hidden="true"
  ><img v-if="src" class="avatar__img" :src="src" alt=""><template v-else>{{ initials }}</template></span>
</template>

<style scoped>
.avatar {
  --size: 36px;
  flex: none;
  display: inline-grid;
  place-items: center;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: var(--jersey);
  color: #fff;
  font-weight: 700;
  font-size: calc(var(--size) * 0.42);
  line-height: 1;
  letter-spacing: 0.02em;
  user-select: none;
  overflow: hidden;
}
.avatar__img { width: 100%; height: 100%; object-fit: cover; }
.avatar--sm { --size: 28px; }
.avatar--md { --size: 36px; }
.avatar--lg { --size: 56px; }
.avatar--xl { --size: 88px; }
.avatar--medal1 { box-shadow: 0 0 0 3px var(--bg), 0 0 0 6px var(--medal-1); }
.avatar--medal2 { box-shadow: 0 0 0 3px var(--bg), 0 0 0 6px var(--medal-2); }
.avatar--medal3 { box-shadow: 0 0 0 3px var(--bg), 0 0 0 6px var(--medal-3); }
</style>
